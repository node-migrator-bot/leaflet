/**
 * Copyright (c) 2012 Andreas Madsen
 * MIT License
 */

var fs = require('fs');
var path = require('path');
var async = require('async');
var mkdirp = require('mkdirp');
var equilibrium = require('equilibrium');

// node < 0.8 compatibility
var exists = fs.exists || path.exists;

function Leaflet(options, callback) {
  var self = this;

  // Check callback
  if (typeof callback !== 'function') {
    throw new Error('callback is missing');
  }

  // Check options
  if (options === null ||
      typeof options !== 'object' ||
      typeof options.read !== 'string' ||
      typeof options.cache !== 'string' ||
      typeof options.state !== 'string') {

    callback(new Error('options object is not valid'));
    return this;
  }

  this.options = options;
  this.handlers = {};
  this.ready = false;
  this.memory = 0;
  this.state = {};
  this.query = {};
  this.watching = false;

  // Resolve filepaths and dirpaths
  Object.keys(options).forEach(function (name) {
    options[name] = path.resolve(options[name]);
  });
  var folders = [options.read, options.cache, path.dirname(options.state)];

  async.waterfall([

    // Create folders
    async.forEach.bind(async, folders, createDirectory),

    // Read stat file
    function (callback) {
      // Read stat file if possibol
      exists(options.state, function (exist) {

        // Set stored stat to empty object if the file don't exist
        if (exist === false) return callback();

        // Read JSON file
        fs.readFile(options.state, 'utf8', function (error, content) {

          // Parse JSON and catch errors
          try {
            self.stat = JSON.parse(content);
          } catch (error) {
            return callback(error);
          }

          callback();
        });
      });
    },

    // Open stat stream
    function (callback) {
      self.statStream = equilibrium(self.options.state);

      function errorFn(error) {
        self.statStream.removeListener('open', openFn);
        callback(error);
      }

      function openFn() {
        self.statStream.removeListener('error', errorFn);
        self.ready = true;
        callback(null);
      }

      self.statStream.once('error', errorFn);
      self.statStream.once('open', openFn);

      self.statStream.open();
    }
  ], callback);
}
module.exports = function (options, callback) {
  return new Leaflet(options, callback);
};

// Check all files in `read` and process them all
var types = ['B', 'KB', 'MB', 'GB'];

Leaflet.prototype.memory = function (size) {
  if (typeof size === 'number') {
    return this.memory = size;
  }

  // convert string to number
  size = size.split(" ").map(function (value) {
    var exp = types.indexOf(types);

    // Parse string as number
    if (exp === -1) {
      return parseInt(value, 10);
    }

    // Convert *B to bytes number
    return Math.pow(1024, exp);
  });

  // Calculate new size
  return this.memory = size[0] * size[1];
};

// Attach handler to given filetypes
Leaflet.prototype.handle = function () {
  var self = this;
  var args = Array.prototype.slice.call(arguments);

  // grap handle function
  var handle = args.pop();

  // get universial handlers and create as empty object if it don't exist
  var allHandlers = self.handlers['*'] || (self.handlers['*'] = []);

  // convert filetype to lowercase
  var filetypes = args.map(function (value) {
    return value.toLowerCase();
  });

  // attach universial handle to already existing file handlers and allHandlers
  if (filetypes.length === 0) {
    Object.keys(this.handlers).forEach(function (type) {
      self.handlers[type].push(handle);
    });

    return;
  }

  // Attach handle to all filetypes
  filetypes.forEach(function (type) {

    // will set handlers[type] to an array if it hasn't been done before.
    // Since already added unversial handlers should be executed first
    // we will copy the allHandlers array and use that
    var handlers = self.handlers[type] || (self.handlers[type] = allHandlers.slice());

    // attach handle function
    handlers.push(handle);
  });
};

// Read and process file, if the file don't exist in memory, `write` directory
// or has been reset by Leaflet.watch
Leaflet.prototype.read = function (filename, callback) {
  var self = this;

  if (this.ready === false) {
    return callback(new Error('leaflet object is not ready'));
  }

  // absolute paths will be relative to read dir
  filename = trimPath(filename);

  // resolve read and write filepath
  var read = path.resolve(this.options.read, filename);
  var write = path.resolve(this.options.cache, filename);

  // create or get callback array
  var callbacks = this.query[filename] || (this.query[filename] = []);

  // append this callback to the stack
  callbacks.push(callback);

  // Just wait if fs.read is in progress
  if (callback.length > 1) {
    return;
  }

  // Try reading data from disk cache
  if (this.state[filename]) {

    // check if source has been modified
    if (this.watching) {
      fs.stat(read, function (error, stat) {
        if (error) {
          updateStat(self, filename);
          return callback(error, null);
        }

        // source has been modified, read from source
        var cache = self.state[filename];
        if (stat.mtime.getTime() > cache.mtime || stat.size !== cache.size) {
          return readSource();
        }

        // source has not been modified, read from cache
        return readCache();
      });

    } else {
      return readCache();
    }
  }

  function readCache() {
    fs.readFile(write, 'utf8', function (error, content) {
      if (error) {
        updateStat(self, filename);
        return readSource();
      }

      return done(error, content);
    });
  }

  function readSource() {
    async.waterfall([
      // read from source directory
      readSourceFile.bind(null, self, filename),

      // parse content though the handlers
      parseContent.bind(null, self, filename),

      // save in drive cache
      saveCache.bind(null, self, filename)

    ], done);
  }

  function done(error, content) {
      if (error) {
        updateStat(self, filename);
        return executeCallbacks(callbacks, error, null);
      }

      // Execute all callbacks
      executeCallbacks(callbacks, null, content);
    }

  readSource();
};

// Find all files in `read` and process them all
Leaflet.prototype.compile = function (callback) {
  if (this.ready === false) {
    return callback(new Error('leaflet object is not ready'));
  }

  callback();
};

// Watch `read` directory for changes and update files once they are requested
Leaflet.prototype.watch = function (callback) {
  if (this.ready === false) {
    return callback(new Error('leaflet object is not ready'));
  }

  this.watching = true;
  return callback();
};

// Execute callback stack
function executeCallbacks(callbacks, error, content) {
  var fn;
  while (fn = callbacks.shift()) {
    fn(error, content);
  }
}

// make a clean read
// callback(error, stat, content)
function readSourceFile(self, filename, callback) {
  async.waterfall([
    // open fd
    function (callback) {
      var filepath = path.resolve(self.options.read, filename);
      fs.open(filepath, 'r', callback);
    },

    // read file stat
    function (fd, callback) {
      fs.fstat(fd, function (error, stat) {
        callback(error, fd, stat);
      });
    },

    // read file content
    function (fd, stat, callback) {
      var buffer = new Buffer(stat.size);
      fs.read(fd, buffer, 0, buffer.length, 0, function (error) {
        callback(error, stat, buffer.toString());
      });
    }
  ], callback);
}

// run file handlers
// callback(error, stat, content)
function parseContent(self, filename, stat, content, callback) {

  // get filetype handlers
  var ext = path.extname(filename).slice(1);
  var handlers = (self.handlers[ext] || self.handlers['*']);

  // Skip parseing if there are no handlers
  if (handlers === undefined) {
    callback(null, stat, content);
  }

  // Wrap handlers so they take both error and content as first argument
  handlers = handlers.map(function (handle) {
    return function (content, callback) {

      // modify filename so it match the new filetype
      if (typeof handle === 'function') {
        return handle(content, function (result) {
          if (result instanceof Error) return callback(result, null);
          callback(null, result);
        });
      }

      // parse as new handler
      filename = filename.substr(0, filename.length - path.extname(filename)) + '.' + handle;
      parseContent(self, filename, stat, content, function (error, filename, stat, content) {
        callback(error, content);
      });
    };
  });

  // execute all filetype handlers
  async.waterfall([
    function (callback) {
      callback(null, content);
    }
  ].concat(handlers), function (error, content) {
    callback(error, stat, content);
  });
}

// Handle file content and save it
// callback(error, content)
function saveCache(self, filename, stat, content, callback) {

  // Update state JSON file
  updateStat(self, filename, stat);

  // write to cache
  var filepath = path.resolve(self.options.cache, filename);
  fs.writeFile(filepath, content, function (error) {
    callback(error, content);
  });
}

// Update the stat
function updateStat(self, filename, stat) {

  // grap set value
  if (arguments.length === 3) {
    self.state[filename] = { mtime: stat.mtime.getTime(), size: stat.size };
  } else {
    delete self.state[filename];
  }

  // save JSON file
  self.statStream.write(JSON.stringify(self.state));
}

// Check if directory exist and create if not
function createDirectory(dirpath, callback) {
  exists(dirpath, function (exist) {
    if (exist) return callback(null);

    mkdirp(dirpath, function (error) {
      if (error) callback(error);

      callback(null);
    });
  });
}

// Trim path safely
var dirSplit = process.platform === 'win32' ? '\\' : '/';
var ignorePaths = ['', '.', '..'];
function trimPath(filepath) {

  // resolve and move all ../ to the begining
  filepath = path.normalize(filepath);

  // remove all ../
  filepath = filepath.split(dirSplit);
  filepath = filepath.filter(function (value) {
    return ignorePaths.indexOf(value) === -1;
  });

  // combine filepath
  filepath = filepath.join(dirSplit);

  // remove ./ and / too
  if (filepath[0] === '.') filepath = filepath.slice(1);
  if (filepath[0] === dirSplit) filepath = filepath.slice(1);

  return filepath;
}
