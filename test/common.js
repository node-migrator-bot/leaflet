/**
 * Copyright (c) 2012 Andreas Madsen
 * MIT License
 */

var path = require('path');
var fs = require('fs');
var wrench = require('wrench');

// node < 0.8 compatibility
exports.exists = fs.exists || path.exists;
exports.existsSync = fs.existsSync || path.existsSync;

// resolve main dirpaths
exports.test = path.dirname(module.filename);
exports.root = path.resolve(exports.test, '..');

// resolve filepath to main module
exports.leaflet = path.resolve(exports.root, 'leaflet.js');

// resolve test dirpaths
exports.fixture = path.resolve(exports.test, 'fixture');
exports.temp = path.resolve(exports.test, 'temp');

// Reset temp directory
exports.reset = function () {
  wrench.rmdirSyncRecursive(exports.temp);
};

// Combine all options
exports.options = {
  read: exports.fixture,
  cache: exports.temp,
  state: path.resolve(exports.temp, 'state.json')
};
