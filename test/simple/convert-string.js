/**
 * Copyright (c) 2012 Andreas Madsen
 * MIT License
 */

var vows = require('vows'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    assert = require('assert'),
    common = require('../common.js'),
    leaflet = require(common.leaflet);

// remove temp content
common.reset();

var mtimeString = fs.statSync(path.join(common.fixture, 'static.json')).mtime.toJSON();

var convert;
vows.describe('testing leaflet converter - string based').addBatch({

  'when a leaflet object is created': {
    topic: function () {
      // create convert object
      async.series([

        // create leaflet object
        function (callback) {
          convert = leaflet(common.options, callback);
        },

        // setup leaflet object
        function (callback) {
          // simpel handlers, will add first and second exports properties
          convert.handle('json', 'string', function (content, next) {
            var obj = JSON.parse(content);
                obj.first = 'first';

            next( JSON.stringify(obj) );
          });

          convert.handle('json', 'string', function (content, next, file) {
            var obj = JSON.parse(content);
                obj.second = 'second';
                obj.file = file;

            next( JSON.stringify(obj) );
          });

          convert.convert('js', 'json');

          callback(null);
        }
      ], this.callback);
    },

    'check that the cache directory was created': function (error, dum) {
      assert.ifError(error);

      assert.isTrue(common.existsSync(common.options.cache));
    },

    'check that the state file was created': function (error, dum) {
      assert.ifError(error);

      assert.isTrue(common.existsSync(common.options.state));
    }
  }

}).addBatch({

  'when reading a file for first time': {
    topic: function () {
      return common.handleStream( convert.read('/static.json') );
    },

    'the content should be parsed by handlers': function (error, content) {
      assert.ifError(error);

      assert.deepEqual(JSON.parse(content), {
        zero: 'zero',
        position: 'root',
        first: 'first',
        second: 'second',
        file: { path: 'static.json', mtime: mtimeString }
      });
    },

    'the stat file': {
      topic: function (content, stream) {
        var self = this;

        setTimeout(function () {
          async.parallel({
            'origin': fs.stat.bind(fs, path.resolve(common.options.source, 'static.json')),
            'compiled': fs.stat.bind(fs, path.resolve(common.options.cache, 'static.json')),
            'cache': fs.readFile.bind(fs, common.options.state, 'utf8'),
            'stream': function (callback) {
              callback(null, stream.mtime);
            }
          }, self.callback);
        }, 200);
      },

      'should be updated': function (error, result) {

        var statFile = JSON.parse(result.cache)['static.json'];

        assert.equal(statFile.mtime, result.stream.getTime());

        assert.deepEqual(statFile, {
          mtime: result.origin.mtime.getTime(),
          size: result.origin.size,
          compiled: result.compiled.size
        });
      }
    },

    'the chached file': {
      topic: function () {
        fs.readFile(path.resolve(common.options.cache, 'static.json'), 'utf8', this.callback);
      },

      'should be created': function (error, content) {
        assert.ifError(error);

        assert.deepEqual(JSON.parse(content), {
          zero: 'zero',
          position: 'root',
          first: 'first',
          second: 'second',
          file: { path: 'static.json', mtime: mtimeString }
        });
      }
    }
  }

}).addBatch({

  'when reading a file second time': {
    topic: function () {
      var self = this;

      // read cache file
      fs.readFile(path.resolve(common.options.cache, 'static.json'), 'utf8', function (error, content) {
        if (error) self.callback(error, null);

        var obj = JSON.parse(content);
            obj.manipulated = true;

        content = JSON.stringify(obj);

        // overwrite cache file
        fs.writeFile(path.resolve(common.options.cache, 'static.json'), content, function (error) {
          self.callback(error, content);
        });
      });
    },

    'the content': {
      topic: function () {
        return common.handleStream( convert.read('/static.json') );
      },

      'shoud be read from cache directory': function (error, content) {
        assert.ifError(error);

        assert.deepEqual(JSON.parse(content), {
          zero: 'zero',
          position: 'root',
          first: 'first',
          second: 'second',
          manipulated: true,
          file: { path: 'static.json', mtime: mtimeString }
        });
      }
    }
  }

}).exportTo(module);
