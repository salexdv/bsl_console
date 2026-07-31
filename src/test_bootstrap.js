require('mocha/mocha.css');
require('mocha/mocha.js');

window.chai = require('chai');
window.mocha.setup('bdd');

require('./test');
