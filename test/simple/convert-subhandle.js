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

var convert;
vows.describe('testing leaflet subhandle').addBatch({

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

          function handle(message) {
            return function (content, next) {
              var obj;

              if (content.indexOf('[') === 0) {
                obj = JSON.parse(content);
              } else {
                obj = [{type: content, state: 0}];
              }

              obj.push(message);

              next( JSON.stringify(obj) );
            };
          }

          convert.handle('txt', 'string', handle( { type: 'txt', state: 1 } ));
          convert.convert('txt', 'txt2');
          convert.convert('txt', 'js');
          convert.handle('txt', 'string', handle( { type: 'txt', state: 2 } ));

          convert.handle('txt2', 'string', handle( { type: 'txt2', state: 1 } ));
          convert.convert('txt2', 'txt3');
          convert.handle('txt2', 'string', handle( { type: 'txt2', state: 2 } ));

          convert.handle('txt3', 'string', handle( { type: 'txt3', state: 1 } ));
          convert.handle('txt3', 'string', handle( { type: 'txt3', state: 2 } ));

          convert.handle('js', 'string', handle( { type: 'js', state: 1 } ));
          convert.convert('js', 'json');
          convert.handle('js', 'string', handle( { type: 'js', state: 2 } ));

          convert.handle('json', 'string', handle( { type: 'json', state: 1 } ));
          convert.handle('json', 'string', handle( { type: 'json', state: 2 } ));

          convert.handle('string', handle( { type: '*', state: 3 } ));

          callback(null);
        }
      ], this.callback);
    },

    'there shoud not be any errors': function (error, dum) {
      assert.ifError(error);
    }
  }

}).addBatch({

  'when converting using subhandlers': {
    topic: function () {
      return common.handleStream( convert.read('/subhandle.txt') );
    },

    'the result should match in proper order': function (error, content) {
      assert.ifError(error);

      assert.deepEqual(JSON.parse(content), [
        {type: 'source', state: 0},
        {type: 'txt',    state: 1},

        {type: 'txt2',   state: 1},
        {type: 'txt3',   state: 1},
        {type: 'txt3',   state: 2},
        {type: 'txt2',   state: 2},

        {type: 'js',     state: 1},
        {type: 'json',   state: 1},
        {type: 'json',   state: 2},
        {type: 'js',     state: 2},

        {type: 'txt',    state: 2},
        {type: '*',      state: 3}
      ]);
    },

    'the renamed cache file': {
      topic: function () {
        fs.readFile(path.resolve(common.options.cache, 'subhandle.txt'), 'utf8', this.callback);
      },

      'should also match': function (error, content) {
        assert.ifError(error);

        assert.deepEqual(JSON.parse(content), [
          {type: 'source', state: 0},
          {type: 'txt',    state: 1},

          {type: 'txt2',   state: 1},
          {type: 'txt3',   state: 1},
          {type: 'txt3',   state: 2},
          {type: 'txt2',   state: 2},

          {type: 'js',     state: 1},
          {type: 'json',   state: 1},
          {type: 'json',   state: 2},
          {type: 'js',     state: 2},

          {type: 'txt',    state: 2},
          {type: '*',      state: 3}
       ]);
      }
    }
  }

}).exportTo(module);
