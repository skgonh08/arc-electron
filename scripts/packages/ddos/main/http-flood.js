const {fork} = require('child_process');
const path = require('path');
const EventEmitter = require('events');
/**
 * A class that simulate HTTP flod by making HTTP requests in bulk.
 * The intensity of the flood is configurable in ARC's UI.
 *
 * When the execution finishes a report is generated and send via `execution-finished`
 * event. The report contains the following properties:
 * - `success` Number. A number of successful requests (server returned 2.x.x or 3.x.x)
 * - `failure` Number. A number of failured requests (server returned error, >= 4.x.x)
 * - `denial` Number. A number of request when connection couldn't be established.
 * - `data` Array<Array<Object>> - List of reported responses per thread.
 * Items in the array contains a list of request executed in each thread.
 * Each execution item contains the following properties:
 * - code - Number or String - Status code or error code (which can be string)
 * - error - Boolean. True when the request is errored
 * - critical - Boolean. True when connection couldn't be established.
 * - index - Number. Request index in the execution queue.
 */
class HttpFlood extends EventEmitter {
  /**
   * @param {Object} opts
   * - url - String. The url to flood with requests
   * - method - String. HTTP method.
   * - payload - String. Message to send. Optional. Unset for GET and HEAD requests.
   * - headers - Object. A map of headers to set with request.
   * - sample - Number. A number of requests to make. 0 for nulimited.
   * - delay - Number. A number of milliseconds between a request.
   * - threads - Number. Number of threads to use to run the request. More threads means
   * more pararell requests but also more resources used.
   */
  constructor(opts) {
    super();
    if (!opts.url) {
      throw new Error('The "url" option is not configured.');
    }
    if (!opts.method) {
      throw new Error('The "method" option is not configured.');
    }

    this.url = opts.url;
    this.method = opts.method;
    if (opts.payload) {
      this.payload = opts.payload;
    }
    if (opts.headers) {
      this.headers = opts.headers;
    }
    if (opts.sample) {
      this.sample = opts.sample;
    } else {
      this.sample = 0;
    }
    if (opts.delay) {
      this.delay = opts.delay;
    } else {
      this.delay = 1;
    }
    if (opts.threads) {
      this.threadsCount = opts.threads;
    } else {
      this.threadsCount = 2;
    }

    if (typeof opts.autoReferer === 'boolean') {
      this.autoReferer = opts.autoReferer;
    } else {
      this.autoReferer = true;
    }
    if (typeof opts.autoUserAgent === 'boolean') {
      this.autoUserAgent = opts.autoUserAgent;
    } else {
      this.autoUserAgent = true;
    }
    if (typeof opts.autoKeepAlive === 'boolean') {
      this.autoKeepAlive = opts.autoKeepAlive;
    } else {
      this.autoKeepAlive = true;
    }

    this.aborted = false;
    this.threads = [];
    this.threadsFinished = 0;

    this.report = {
      success: 0,
      failure: 0,
      denial: 0,
      data: []
    };
  }
  /**
   * Aborts current execution.
   *
   * No further events are emitted after calling this function.
   */
  abort() {
    this.aborted = true;
    this.killThreads();
  }
  /**
   * Sends abort signal to the background threads and kills them.
   */
  killThreads() {
    this.threads.forEach((thread) => {
      thread.send({
        cmd: 'abort'
      });
      thread.kill();
    });
  }
  /**
   * Creates background threads and executes the flood.
   *
   * The application should listen for `execution-finished` event emitted by the
   * events emitter to read the final report.
   *
   * Each time a request finished the `request-finished` event is emitted.
   */
  execute() {
    const hasSample = this.sample > 0;
    const threads = hasSample ? Math.min(this.threadsCount, this.sample) : 2;
    const cnt = hasSample ? Math.floor(this.sample/threads) : 0;
    let delta;
    if (hasSample) {
      const size = cnt * threads;
      if (size !== this.sample) {
        delta = this.sample - size;
      }
    }
    for (let i = 0; i < threads; i++) {
      const proc = this.createThread();
      let currentSample = cnt;
      if (delta && i === 0) {
        currentSample += delta;
      }
      proc.send({
        cmd: 'run',
        url: this.url,
        method: this.method,
        headers: this.headers,
        payload: this.payload,
        sample: currentSample,
        delay: this.delay,
        autoReferer: this.autoReferer,
        autoUserAgent: this.autoUserAgent,
        autoKeepAlive: this.autoKeepAlive
      });
    }
  }
  /**
   * Creates new execution thread, adds it to the list of threads, and returns it.
   * @return {Object} New thread reference.
   */
  createThread() {
    const file = path.join(__dirname, 'flood-runner.js');
    const opts = {};
    const args = [];
    const proc = fork(file, args, opts);
    const id = this.threads.length;
    this.threads.push(proc);
    proc.on('message', (msg) => this._threadMeassageHandler(msg, id));
    proc.on('error', () => this._threadErrorHandler(id));
    return proc;
  }
  /**
   * Handler for the message from a thread.
   * @param {Object} message Received message
   * @param {Number} id Index of the thread.
   */
  _threadMeassageHandler(message, id) {
    if (this.aborted) {
      return;
    }
    switch (message.cmd) {
      case 'report': this._addReport(message, id); break;
      case 'finished': this._handleFinished(); break;
    }
  }
  /**
   * Handler for an error generated by the thread.
   * It is not error sent by the execution logic. It's rather node's error.
   */
  _threadErrorHandler() {
    this.threadsFinished++;
    this._tryReport();
  }
  /**
   * Adds report to the list of reports and emitts `request-finished` event.
   * @param {Object} report Incoming message from the child process.
   * @param {Number} id Index of the request.
   */
  _addReport(report, id) {
    if (report.critical) {
      this.report.denial++;
    } else if (report.error) {
      this.report.failure++;
    } else {
      this.report.success++;
    }
    delete report.cmd;
    if (!this.report.data[id]) {
      this.report.data[id] = [];
    }
    this.report.data[id].push(report);
    this.emit('request-finished', report, id);
  }
  /**
   * Handles `finished` message from the child process.
   */
  _handleFinished() {
    this.threadsFinished++;
    this._tryReport();
  }
  /**
   * Tests if the execution of the flood finished and reports it.
   * Also kills the threads.
   */
  _tryReport() {
    if (this.aborted) {
      return;
    }
    if (this.threadsFinished === this.threads.length) {
      this.emit('execution-finished', this.report);
      this.killThreads();
    }
  }
}
module.exports.HttpFlood = HttpFlood;
