var duplex = require('duplex')

function isString (s) {
  return 'string' === typeof s
}

function isObject (o) {
  return o && 'object' == typeof o
}

// eventually you get to a point where you
// know that seeing da39a3ee5e...
// means you have a bug.

var EMPTY = "da39a3ee5e6b4b0d3255bfef95601890afd80709"

// that is the hash of the empty string.

module.exports = function (merkle) {

  // when a branch is exchanged,
  // if two subbranches are equal, that portion is in sync.
  // if you are missing a branch, wait for that digest.
  // if you have an extra branch, send that subbranch.
  // if a subbranch is not equal, expand that sub branch.

  // if you receive a leaf, that is not in a branch (but you have a corisponding branch)
  // send a request for that leaf.

  var d = duplex()

  d.waiting = {}

  d.send = function (hash, obj) {
    d._data({key: hash, value: obj})
  }

  d.receive = function (hash) {
    merkle.update(hash)
    // we need to know when the replication is complete,
    // if we are serious about comparing sets.
    var tree = merkle.get(hash)
    var pre = tree.pre, h
    do {
      if(h = d.waiting[pre]) {
        if(hash === merkle.subtree(pre).digest()) {
          delete d.waiting[pre]
          break;
        }
      }
      pre = pre.substring(0, pre.length - 1)
    } while(pre.length);

    for(var k in d.waiting)
      return

    //if there are no more waiting messages,
    //then emit sync!
    d.emit('sync', merkle.digest())
  }

  function onData(data) {
    //this occurs only on the top hash.
    if(isString(data)) {
      if(merkle.digest() == data) {
        d.emit('sync', data)
      } else if(data === EMPTY) {
        d.emit('send_branch', merkle.prefix(), merkle.digest())        
      } else if(merkle.digest() !== EMPTY) {
        d.target = data
        d.emit('diff', '')
        d._data(['', merkle.expand()])
      }

    } else if(Array.isArray(data)) {
      var pre = data[0]
      var hashes = data[1]
      var tree = merkle.subtree(pre)

      //request for just one hash
      if(hashes === null) {
        //TODO: find out how often this happens?
        return d.emit('send_branch', pre, tree.digest())
      }
      var a = []
      if(tree)
        tree.tree.forEach(function (e, k) {
          var p = e.prefix()
          var h = hashes[p]
          if(h) {
            if(isString(h)) {
              // other side is a leaf,
              // so send the entire branch,
              // except that leaf (if you have it)
              if(h !== e.digest()) {
                d.emit('send_branch', e.prefix(), e.digest(), h /*exclude*/)
                //if this side does not have h, send a request for that object
                //this only happens when comparing a branch with a leaf.
                if(!e.leaf && !~e.leaves().indexOf(h)) {
                  d._data([p, null])
                }
              }
              else
                d.emit('branch_sync', p, h)
            } else if (isObject(h) && e.digest() === h.hash) {
              //mark synced branches
              e.sync = true
              d.emit('branch_sync', p, h.hash)
            } else {
              //how to mark a different item?
              if(e.leaf) {
                //do not send a leaf, when comparing against a branch.
                //the other side will request this leaf if it's missing.
              }
              else
                d._data([e.prefix(), e.expand()])
            }
            delete hashes[p]
          } else {
            //this branch will be in sync, once it's recieved on the other side.
            e.sync = true
            d.emit('send_branch', e.prefix(), e.digest())
          }
        })

      for(var k in hashes) {
        //hmm... use await to detect when everything has been replicated?
        //create the Merkle node already,
        //and mark it's target. then, when it's digest becomes correct,
        //we will know.

        //then, when we update a branch with an expectation,
        //after updating it, compute it's digest, to see if it's synced.
        //if it is, mark as sync, and emit sync_branch

        //when inserting children, don't update their 

        d.emit('await_branch', k, hashes[k])
      }
    } else if(data.key) {
      d.receive(data.key, data.value)
      d.emit('receive', data.key, data.value)
    }
  }

  d.on('await_branch', function (k, hash) {
    d.waiting[k] = hash
  })

  var queue = []
  var onQueue = queue.push.bind(queue)
  d.on('_data', onQueue)

  // and then stream the actual data somehow...
  // one easy way would just be to put the merkle tree inside
  // a mux-demux, and stream each object as a separate stream.
  // that would work well for replicating files, certainly.

  // otherwise, hmm, maybe just expose a send method on the stream?
  // so that other data can be sent?

  d._started = null

  d.start = function (s) {
    if(s === false) return d._started = false, d
    if(d._started) return d
    d._started = true

    while(queue.length)
      onData(queue.shift())

    d.removeListener('_data', onQueue)
    d.on('_data', onData)
    d._data(merkle.digest())
    return d
  }

  process.nextTick(function () {
    if(d._started !== false)
      d.start()
  })

  return d
}

