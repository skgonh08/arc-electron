const {fork} = require('child_process');
const path = require('path');
/**
 * A class that simulate HTTP flod by making HTTP requests in bulk.
 * The intensity of the flood is configurable in ARC's UI.
 */
class HttpFlood {
  /**
   * @param {Object} opts
   * - url - String. The url to flood with requests
   * - method - String. HTTP method.
   * - payload - String. Message to send. Optional. Unset for GET and HEAD requests.
   * - headers - Object. A map of headers to set with request.
   * - sample - Number. A number of requests to make. 0 for nulimited.
   * - delay - Number. A number of milliseconds between a request.
   * - threads - Number. Number of threads to use to run the request. More threads means
   * more pararell requests but also more resources use.
   */
  constructor(opts) {
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
      this.threads = opts.threads;
    } else {
      this.threads = 2;
    }

    this.aborted = false;
    this.threads = [];

    this.report = {
      success: 0,
      failure: 0,
      denial: 0,
      data: []
    };

    this._threadMeassageHandler = this._threadMeassageHandler.bind(this);
    this._threadErrorHandler = this._threadErrorHandler.bind(this);
  }

  abort() {
    this.aborted = true;
    this.killThreads();
  }

  killThreads() {
    this.threads.forEach((thread) => {
      thread.send({
        cmd: 'abort'
      });
      thread.kill();
    });
  }

  execute() {
    const hasSample = this.sample > 0;
    const threads = hasSample ? Math.min(this.threads, this.sample) : 2;
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
        sample: currentSample,
        delay: this.delay
      });
    }
  }

  createThread() {
    const file = path.join(__dirname, 'flood-runner.js');
    const opts = {};
    const args = [];
    const proc = fork(file, args, opts);
    this.threads.push(proc);
    proc.on('message', this._threadMeassageHandler);
    proc.on('error', this._threadErrorHandler);
    return proc;
  }

  _threadMeassageHandler(message) {
    if (message.cmd === 'report') {
      if (message.critical) {
        this.report.denial++;
      } else if (message.error) {
        this.report.failure++;
      } else {
        this.report.success++;
      }
      this.report.data.push(message);
    } else if (message.cmd === 'finished') {
      // do stuff
    }
  }

  _threadErrorHandler() {

  }
}
module.exports.HttpFlood = HttpFlood;
