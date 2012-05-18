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
vows.describe('testing leaflet watcher').addBatch({

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
          convert.handle('json', function (content, next) {
            var obj = JSON.parse(content);
                obj.first = 'first';

            next( JSON.stringify(obj) );
          });

          convert.handle('json', function (content, next) {
            var obj = JSON.parse(content);
                obj.second = 'second';

            next( JSON.stringify(obj) );
          });

          callback(null);
        },

        // start wacher
        function (callback) {
          convert.watch(callback);
        }
      ], this.callback);
    },

    'check that the cache directory was created': function (error, dum) {
      assert.ifError(error);

      assert.isTrue(common.existsSync(common.options.cache));
    },

    'check that the state file was created': function (error, dum) {
      assert.ifError(error);

      assert.isTrue(common.existsSync(common.options.cache));
    }
  }

}).addBatch({

  'when reading a file for first time': {
    topic: function () {
      convert.read('/change.json', this.callback);
    },

    'the content should be parsed by handlers': function (error, content) {
      assert.ifError(error);

      assert.deepEqual(JSON.parse(content), {
        first: 'first',
        second: 'second',
        state: 1
      });
    },

    'the stat file': {
      topic: function () {
        async.parallel({
          'origin': fs.stat.bind(fs, path.resolve(common.options.read, 'change.json')),
          'cache': fs.readFile.bind(fs, common.options.state, 'utf8')
        }, this.callback);
      },

      'should be updated': function (error, result) {
        assert.ifError(error);

        assert.equal(result.origin.mtime.getTime(), JSON.parse(result.cache)['change.json']);
      }
    },

    'the chached file': {
      topic: function () {
        fs.readFile(path.resolve(common.options.cache, 'change.json'), 'utf8', this.callback);
      },

      'should be created': function (error, content) {
        assert.ifError(error);

        assert.deepEqual(JSON.parse(content), {
          first: 'first',
          second: 'second',
          state: 1
        });
      }
    }
  }

}).addBatch({

  'when the source file is modified': {
    topic: function () {
      async.series({
        expected: function (callback) {
          // we will need to wait some time so fs.Stat.mtime won't be the same
          // PS: it is an unlikly edgecase that the source will be modified twise in the same second
          setTimeout(function () {
            common.modify(callback);
          }, 1200);
        },
        content: convert.read.bind(convert, '/change.json')
      }, this.callback);
    },

   'the content should be parsed by handlers': function (error, result) {
      assert.ifError(error);

      assert.deepEqual(JSON.parse(result.content), {
        first: 'first',
        second: 'second',
        state: result.expected
      });
    },

    'the stat file': {
      topic: function () {
        async.parallel({
          'origin': fs.stat.bind(fs, path.resolve(common.options.read, 'change.json')),
          'cache': function (callback) {

            // Since state.json is handled by equilibrium, there is no need for waiting for equilibrium
            // to drain out before executing the callback, however this has the side effect
            // that the testcase sometimes will fail, because the state.json file hasn't been updated
            setTimeout(function () {
              fs.readFile(common.options.state, 'utf8', callback);
            }, 1000);
          }
        }, this.callback);
      },

      'should be updated': function (error, result) {
        assert.ifError(error);

        assert.equal(result.origin.mtime.getTime(), JSON.parse(result.cache)['change.json']);
      }
    },

    'the chached file': {
      topic: function (result) {
        var self = this;
        fs.readFile(path.resolve(common.options.cache, 'change.json'), 'utf8', function (error, content) {
          self.callback(error, result.expected, content);
        });
      },

      'should be updated': function (error, expected, content) {
        assert.ifError(error);

        assert.deepEqual(JSON.parse(content), {
          first: 'first',
          second: 'second',
          state: expected
        });
      }
    }
  }

}).exportTo(module);
