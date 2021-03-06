
var tape = require('tape')

var util = require('../util')
var tree = require('../slow')
var Merkle = require('../')
tree = Merkle.tree

function count (tree) {
  var s = 0
  if('string' === typeof tree)
    return 1
  else
    for (var k in tree.tree) {
      s += count(tree.tree[k])
    }
  return s + 1
}
var crypto = require('crypto')
function hash (n) {
  n = (n | 0).toString(16)
  if(n.length % 2)
    n = '0' + n
  return crypto.createHash('sha1').update(n, 'hex').digest('hex')
}

console.log('Input Size (N), Time Taken (ms), Ops/Millisecond (ops/ms), hash')

var _t =  1
var sqrt2 = Math.pow(2, .5)
var N = 1000, j = 0
var a = []

//var g = new Merkle()
while(N < (1 << 21)) {
  while(j <= N) {
    a.push(hash(j++))
    //g.update(hash(j++))
  }
  var start = Date.now()
  var m = 0, g
  while(Date.now() === start) {
    m ++
    g = tree(a)
  }
  
  var t = Date.now() - start || 1
  var d = g.digest()
  console.log([j, t, j/t, d].join(', '))
  _t = t
  var _N = N
  while(N < _N + 1)
    N = N * sqrt2
}

