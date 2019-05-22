const http = require('http');
const https = require('https');
const url = require('url');
const EventEmitter = require('events');
const UserAgents = require('./user-agents.js');
const Referrers = require('./referers.js');

class FloodRunner extends EventEmitter {
  /**
   * Initializes and runs the requests queue.
   * @param {Object} opts - Unless otherwise stated, all parameters are required.
   * - url - String, request url
   * - method - String, request HTTP method
   * - payload - String, optional. Message to send.
   * - autoReferer - Boolean, optional. Add referer to the headers list
   * - autoUserAgent - Boolean, optional. Add user-agent to the headers list
   * - autoKeepAlive - Boolean, optional. Add keep-alive to the headers list
   * - sample - Number. Number of request to make. 0 for no limit. When 0, use larger
   * `delay` or it may hang the application.
   * - delay - Number. Number of milliseconds to wait between requests.
   *
   * Requests are made in pararell in the loop. It uses `delay` property to set
   * delay between them.
   */
  run(opts) {
    this.url = opts.url;
    this.requestOptions = url.parse(this.url);
    this.hostname = this.requestOptions.hostname;
    this.method = opts.method;
    this.payload = opts.payload;

    this.autoReferer = opts.autoReferer;
    this.autoUserAgent = opts.autoUserAgent;
    this.autoKeepAlive = opts.autoKeepAlive;

    this.sample = opts.sample;
    this.delay = opts.delay;
    this.baseHeaders = this.processHeaders(opts.headers, this.hostname);
    this.current = 0;
    this.hasSample = this.sample > 0;

    if (['get', 'head'].indexOf(this.method.toLowerCase()) !== -1) {
      delete this.payload;
    }

    this.requests = 0;
    this.responses = 0;
    this.aborted = false;
    this.currentRequest = undefined;

    this.next();
  }
  /**
   * Creates a list of base headers to be send with the request.
   * @param {Object} headers Map of headers to send.
   * @param {String} hostname Server's host name
   * @return {Object} List of headers to add to a request.
   */
  processHeaders(headers, hostname) {
    if (!headers) {
      headers = {};
    }
    const headersKeys = [];
    Object.keys(headers).forEach((key) => {
      headersKeys.push(key.toLowerCase());
    });
    if (headersKeys.indexOf('cache-control') === -1) {
      headers['Cache-Control'] = 'no-cache';
    }
    if (headersKeys.indexOf('accept-charset') === -1) {
      headers['Accept-Charset'] = 'utf-8;q=0.7,*;q=0.7';
    }
    if (headersKeys.indexOf('host') === -1) {
      headers.Host = hostname;
    }
    return headers;
  }
  /**
   * Aborts current execution queue.
   *
   * No event is emitted after calling this function.
   */
  abort() {
    this.aborted = true;
    if (this.currentRequest) {
      this.currentRequest.abort();
    }
    if (this.execTimeout) {
      clearTimeout(this.execTimeout);
      this.execTimeout = undefined;
    }
  }
  /**
   * Runs next request from the queue.
   */
  next() {
    if (this.aborted) {
      return;
    }
    if (this.hasSample && this.current >= this.sample) {
      return;
    }
    this.current++;
    this.execTimeout = setTimeout(() => {
      this._execute();
      this.next();
    }, this.delay);
  }
  /**
   * Creates a complete list of headers to be send with the request.
   * @return {Object}
   */
  computeRequestHeaders() {
    const headers = Object.assign({}, this.baseHeaders);
    const headersKeys = [];
    Object.keys(headers).forEach((key) => {
      headersKeys.push(key.toLowerCase());
    });
    if (this.autoUserAgent && headersKeys.indexOf('user-agent') === -1) {
      const index = Math.floor(Math.random() * UserAgents.length);
      headers['User-Agent'] = UserAgents[index];
    }
    if (this.autoKeepAlive && headersKeys.indexOf('keep-alive') === -1) {
      headers['Keep-Alive'] = (110 + Math.floor(Math.random() * 11)).toString();
    }
    if (this.autoReferer && headersKeys.indexOf('referer') === -1) {
      const index = Math.floor(Math.random() * Referrers.length);
      headers.Referer = Referrers[index] + encodeURIComponent(this._randomString());
    }
    return headers;
  }
  /**
   * Executes a request.
   */
  _execute() {
    if (this.aborted) {
      return;
    }
    const id = this.requests++;
    const requestBase = this.requestOptions.protocol === 'https:' ? https : http;
    const opts = Object.assign({}, this.requestOptions);
    opts.headers = this.computeRequestHeaders();
    opts.method = this.method.toUpperCase();

    const request = requestBase.request(opts, (response) => this._responseHandler(response, id));
    request.on('error', (e) => this._errorHandler(e, id));
    request.on('timeout', () => this._timeoutHandler(id));
    if (this.payload) {
      request.write(this.payload);
    }
    request.setTimeout(5000);
    request.end();
    this.currentRequest = request;
  }
  /**
   * Handler for incoming message from the server.
   * @param {Object} response Node's IncomingMessage instance
   * @param {Number} id Index of the request.
   */
  _responseHandler(response, id) {
    if (this.aborted) {
      return;
    }
    this.responses++;
    const report = {
      code: response.statusCode,
      error: response.statusCode >= 400,
      critical: false,
      cmd: 'report',
      index: id
    };
    process.send(report);
    this._tryReport();
  }
  /**
   * Request error handler.
   * @param {Error} e Error associated with the request
   * @param {Number} id Index of the request.
   */
  _errorHandler(e, id) {
    if (this.aborted) {
      return;
    }
    this.responses++;
    const report = {
      code: e.code,
      error: true,
      critical: true,
      cmd: 'report',
      index: id
    };
    process.send(report);
    this._tryReport();
  }
  /**
   * Request timeout handler.
   * @param {Number} id Index of the request.
   */
  _timeoutHandler(id) {
    if (this.aborted) {
      return;
    }
    this.responses++;
    const report = {
      code: -6,
      error: true,
      critical: true,
      cmd: 'report',
      index: id
    };
    process.send(report);
    this._tryReport();
  }
  /**
   * Generates a random strng value for refferer filed
   * @return {String}
   */
  _randomString() {
    return String.fromCharCode(
      (5 + Math.floor(Math.random() * 30)),
      (5 + Math.floor(Math.random() * 60)),
      (10 + Math.floor(Math.random() * 70)));
  }
  /**
   * Reports that the thread has finished when there's nothing else to do.
   */
  _tryReport() {
    if (this.aborted) {
      return;
    }
    if (this.hasSample && this.current >= this.sample && this.requests === this.responses) {
      process.send({cmd: 'finished'});
    }
  }
}
const runner = new FloodRunner();
module.exports = runner;
process.on('message', (payload) => {
  switch (payload.cmd) {
    case 'run': runner.run(payload); break;
    case 'abort': runner.abort(payload); break;
  }
});
