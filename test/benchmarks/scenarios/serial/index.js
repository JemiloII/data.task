// Copyright (c) 2014 Quildreen Motta <quildreen@gmail.com>
//
// Permission is hereby granted, free of charge, to any person
// obtaining a copy of this software and associated documentation files
// (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge,
// publish, distribute, sublicense, and/or sell copies of the Software,
// and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// Light serial tasks
// ==================
// 
// This scenario involves doing lightweight tasks, but where every task depends
// on the value of the previous task, and as such must be run
// sequentially. This is the worst case for concurrency, since you can't have
// concurrency at all, and it's here because sometimes you have portions of
// your application where all values depend on the previous one.
// 
// The scenario:
// 
// * An implementation receives a list of tasks;
// * All tasks are of type `(Error, String → Void)`;
// * Tasks much be ran sequentially, and their results collected in an array;
// * If one of the tasks pass an `Error` value, the entire sequence should be
//   aborted;
// * The implementation should pass the collected array to the node-style
//   callback;

var benchmark = require('test.benchmark');
var dummy = require('../../dummy');
var Future = require('data.future');
var NewFuture = require('data.future-new');
var Bluebird = require('bluebird');

function sum(xs) {
  return xs.reduce(function(a, b){ return a + b }, 0);
}

// -- Implementations
var impl = {
  baseline: require('./callback-baseline'),
  async: require('./callback-async'),
  futures: require('./data.future.js')(Future),
  newFutures: require('./data.future.js')(NewFuture),
  bluebird: require('./bluebird')
}

// -- Helpers
function run(f, xs, result) {
  return new Future(function(reject, resolve) {
    f(xs, function(error, data) {
      if (error) {
        reject(error);
      }
      else if (sum(data) !== result) {
        reject(new Error('Invalid result: ' + sum(data) + ', expected: ' + result));
      } else {
        resolve(data);
      }
    });
  })
}


function toFuture(F){ return function(f) {
  return new F(function(reject, resolve) {
    f(function(error, data) {
      if (error)  reject(error)
      else        resolve(data)
    })
  })
}}

function toBluebird(f) {
  return function() {
    return new Bluebird(function(resolve, reject) {
      f(function(error, data) {
        if (error)  reject(error)
        else        resolve(data)
      })
    })
  }
}

// -- Benchmarks

// So, since this benchmarks only tests sequencing of asynchronous actions, the
// absolute worst case here is when all of the tasks that we need to run are
// asynchronous. In this case, we check how much overhead gets introduced by each
// concurrency primitive that gets slapped on top of Node's blessed CPS APIs.
function light() {
  var data = dummy.range(0, 10).map(dummy.randomByte);
  var result = sum(data);
  var tasks = data.map(dummy.lightTask);
  
  return {
    'Callbacks (baseline)': run(impl.baseline, tasks, result),
    'Callbacks (Async)': run(impl.async, tasks, result),
    'Tasks (Data.Future)': run(impl.futures, tasks.map(toFuture(Future)), result),
    'Tasks (new Data.Future)': run(impl.newFutures, tasks.map(toFuture(NewFuture)), result),
    'Promises/A+ (Bluebird)': run(impl.bluebird, tasks.map(toBluebird), result)
  }
}

// A less bad scenario is one where we've got mixed asynchronous actions
// and synchronous actions. There are plenty of times where data is cached
// so we don't need to recompute, or simply that we lift some value into
// the asynchronous world so we can compose things, but don't do any real
// computation. A good concurrency primitive should add the minimum possible
// of overhead to synchronous computations.
function lightMixed() {
  var bytesA = dummy.range(0, 10).map(dummy.randomByte);
  var bytesB = dummy.range(0, 30).map(dummy.randomByte);
  var result = sum(bytesA.concat(bytesB));
  var actions = bytesA.map(dummy.lightTask);
  var noise = bytesB.map(dummy.syncTask);
  var tasks = actions.concat(noise).sort(dummy.randomDistribution);
  
  return {
    'Callbacks (baseline)': run(impl.baseline, tasks, result),
    'Callbacks (Async)': run(impl.async, tasks, result),
    'Tasks (Data.Future)': run(impl.futures, tasks.map(toFuture(Future)), result),
    'Tasks (new Data.Future)': run(impl.newFutures, tasks.map(toFuture(NewFuture)), result),
    'Promises/A+ (Bluebird)': run(impl.bluebird, tasks.map(toBluebird), result)
  }
}

// Then, we might run into some edge scenarios where all of the data is
// synchronous, but they're lifted into the asynchronous world (perhaps
// because they're cached, perhaps because we're trying to provide the
// same API for a certain thing — e.g.: storage). This tests only the
// overhead introduced by the concurrency primitive *in the synchronous
// world*, ideally this should be really small.
function sync() {
  var data = dummy.range(0, 100).map(dummy.randomByte);
  var result = sum(data);
  var tasks = data.map(dummy.syncTask);
  
  return {
    'Callbacks (baseline)': run(impl.baseline, tasks, result),
    'Callbacks (Async)': run(impl.async, tasks, result),
    'Tasks (Data.Future)': run(impl.futures, tasks.map(toFuture(Future)), result),
    'Tasks (new Data.Future)': run(impl.newFutures, tasks.map(toFuture(NewFuture)), result),
    'Promises/A+ (Bluebird)': run(impl.bluebird, tasks.map(toBluebird), result)
  }
}

module.exports = [
  benchmark.asyncSuite('Serial (light tasks)', light()),
  benchmark.asyncSuite('Serial (mixed sync/light tasks)', lightMixed()),
  benchmark.asyncSuite('Serial (all synchronous)', sync())
]