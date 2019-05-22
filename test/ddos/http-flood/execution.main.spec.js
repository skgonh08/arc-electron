const {HttpFlood} = require('../../../scripts/packages/ddos/main/http-flood');
const {assert} = require('chai');
const http = require('http');
const sinon = require('sinon');

describe('Executing flood', function() {
  let server;
  before(() => {
    server = http.createServer((req, res) => {
      switch (req.url) {
        case '/success':
          res.writeHead(200, {'Content-Type': 'text/plain'});
          res.end('OK');
          break;
        case '/failure':
          res.writeHead(500, {'Content-Type': 'text/plain'});
          res.end('Server error');
          break;
        default:
          res.writeHead(400, {'Content-Type': 'text/plain'});
          res.end('Client error');
      }
    });
    server.on('clientError', (err, socket) => {
      console.log('REQUEST ERROR', err);
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
    server.on('error', (err) => {
      console.log('REQUEST GENERAL ERROR', err);
    });
    server.listen(8123);
  });

  after((done) => {
    server.close(() => done());
  });

  describe('Constructor', () => {
    let params;

    beforeEach(() => {
      params = {
        url: 'https://domain.com',
        method: 'POST',
        payload: 'test',
        headers: {
          'content-type': 'x-test'
        }
      };
    });

    it('Throws when no url', () => {
      assert.throws(() => {
        new HttpFlood({
          method: 'GET'
        });
      });
    });

    it('Throws when no method', () => {
      assert.throws(() => {
        new HttpFlood({
          url: 'https://domain.com'
        });
      });
    });

    it('Sets url property', () => {
      const instance = new HttpFlood(params);
      assert.equal(instance.url, params.url);
    });

    it('Sets method property', () => {
      const instance = new HttpFlood(params);
      assert.equal(instance.method, params.method);
    });

    it('Sets payload property', () => {
      const instance = new HttpFlood(params);
      assert.equal(instance.payload, params.payload);
    });

    it('Sets payload property', () => {
      const instance = new HttpFlood(params);
      assert.equal(instance.payload, params.payload);
    });

    it('Payload has no default value', () => {
      delete params.payload;
      const instance = new HttpFlood(params);
      assert.isUndefined(instance.payload);
    });

    it('Sets headers property', () => {
      const instance = new HttpFlood(params);
      assert.deepEqual(instance.headers, params.headers);
    });

    it('Headers has no default value', () => {
      delete params.headers;
      const instance = new HttpFlood(params);
      assert.isUndefined(instance.headers);
    });

    it('Sets sample property', () => {
      params.sample = 200;
      const instance = new HttpFlood(params);
      assert.equal(instance.sample, 200);
    });

    it('Sets delay property', () => {
      params.delay = 200;
      const instance = new HttpFlood(params);
      assert.equal(instance.delay, 200);
    });

    it('Sets threadsCount property', () => {
      params.threads = 10;
      const instance = new HttpFlood(params);
      assert.equal(instance.threadsCount, 10);
    });

    it('Sets default sample', () => {
      const instance = new HttpFlood(params);
      assert.equal(instance.sample, 0);
    });

    it('Sets default delay', () => {
      const instance = new HttpFlood(params);
      assert.equal(instance.delay, 1);
    });

    it('Sets default threadsCount', () => {
      const instance = new HttpFlood(params);
      assert.equal(instance.threadsCount, 2);
    });

    it('Sets default autoReferer', () => {
      const instance = new HttpFlood(params);
      assert.isTrue(instance.autoReferer);
    });

    it('Sets default autoUserAgent', () => {
      const instance = new HttpFlood(params);
      assert.isTrue(instance.autoUserAgent);
    });

    it('Sets default autoKeepAlive', () => {
      const instance = new HttpFlood(params);
      assert.isTrue(instance.autoKeepAlive);
    });

    it('Sets autoReferer property', () => {
      params.autoReferer = false;
      const instance = new HttpFlood(params);
      assert.isFalse(instance.autoReferer);
    });

    it('Sets autoUserAgent property', () => {
      params.autoUserAgent = false;
      const instance = new HttpFlood(params);
      assert.isFalse(instance.autoUserAgent);
    });

    it('Sets autoKeepAlive property', () => {
      params.autoKeepAlive = false;
      const instance = new HttpFlood(params);
      assert.isFalse(instance.autoKeepAlive);
    });

    it('Initializes aborted property', () => {
      const instance = new HttpFlood(params);
      assert.isFalse(instance.aborted);
    });

    it('Initializes threads property', () => {
      const instance = new HttpFlood(params);
      assert.deepEqual(instance.threads, []);
    });

    it('Initializes report property', () => {
      const instance = new HttpFlood(params);
      assert.deepEqual(instance.report, {
        success: 0,
        failure: 0,
        denial: 0,
        data: []
      });
    });
  });

  describe('abort()', () => {
    let instance;

    beforeEach(() => {
      const params = {
        url: 'https://domain.com',
        method: 'POST'
      };
      instance = new HttpFlood(params);
    });

    it('Sets aborted property', () => {
      instance.abort();
      assert.isTrue(instance.aborted);
    });

    it('Calls killThreads()', () => {
      const spy = sinon.spy(instance, 'killThreads');
      instance.abort();
      assert.isTrue(spy.called);
    });
  });

  describe('killThreads()', () => {
    let instance;
    let thread;

    beforeEach(() => {
      const params = {
        url: 'https://domain.com',
        method: 'POST'
      };
      instance = new HttpFlood(params);
      thread = {
        send: () => {},
        kill: () => {}
      };
      instance.threads = [thread];
    });

    it('Calls send() with params on a thread', () => {
      const spy = sinon.spy(thread, 'send');
      instance.killThreads();
      assert.deepEqual(spy.args[0][0], {cmd: 'abort'});
    });

    it('Calls kill() on a thread', () => {
      const spy = sinon.spy(thread, 'kill');
      instance.killThreads();
      assert.isTrue(spy.called);
    });
  });

  describe('createThread()', () => {
    let instance;

    beforeEach(() => {
      const params = {
        url: 'https://domain.com',
        method: 'POST'
      };
      instance = new HttpFlood(params);
    });

    it('Returns a thread', () => {
      const proc = instance.createThread();
      assert.ok(proc);
      proc.kill();
    });

    it('Adds a thread to the threads list', () => {
      const proc = instance.createThread();
      assert.lengthOf(instance.threads, 1);
      proc.kill();
    });
  });

  describe('execute()', () => {
    let params;
    const baseUrl = 'http://localhost:8123/';

    beforeEach(() => {
      params = {
        url: baseUrl + 'success',
        method: 'POST',
        payload: 'test',
        headers: {
          'content-type': 'x-test'
        },
        sample: 2,
        threads: 1
      };
    });

    it('Execute requests', (done) => {
      const instance = new HttpFlood(params);
      instance.once('execution-finished', (report) => {
        assert.typeOf(report, 'object');
        done();
      });
      instance.execute();
    });

    it('Creates single thread', (done) => {
      const instance = new HttpFlood(params);
      instance.once('execution-finished', () => {
        done();
      });
      instance.execute();
      assert.lengthOf(instance.threads, 1);
    });

    it('Creates maximum threads', (done) => {
      params.threads = 3;
      const instance = new HttpFlood(params);
      instance.once('execution-finished', () => {
        done();
      });
      instance.execute();
      assert.lengthOf(instance.threads, 2);
    });

    it('Report has success', (done) => {
      const instance = new HttpFlood(params);
      instance.once('execution-finished', (report) => {
        assert.equal(report.success, 2);
        done();
      });
      instance.execute();
    });

    it('Report has data', (done) => {
      const instance = new HttpFlood(params);
      instance.once('execution-finished', (report) => {
        assert.deepEqual(report.data, [
          [{code: 200, error: false, critical: false, index: 0},
          {code: 200, error: false, critical: false, index: 1}]
        ]);
        done();
      });
      instance.execute();
    });

    it('Report has failure', (done) => {
      params.url = baseUrl + 'failure';
      const instance = new HttpFlood(params);
      instance.once('execution-finished', (report) => {
        assert.equal(report.failure, 2);
        done();
      });
      instance.execute();
    });

    it('Report has denial', (done) => {
      params.url = 'http://localhost:8124/denial';
      const instance = new HttpFlood(params);
      instance.once('execution-finished', (report) => {
        assert.equal(report.denial, 2);
        done();
      });
      instance.execute();
    });

    it('Reports request ended', (done) => {
      const instance = new HttpFlood(params);
      const data = [];
      instance.on('request-finished', (report) => {
        data.push(report);
      });
      instance.once('execution-finished', () => {
        assert.lengthOf(data, 2);
        done();
      });
      instance.execute();
    });
  });

  describe('_threadMeassageHandler()', () => {
    let instance;
    beforeEach(() => {
      const params = {
        url: 'http://domain.com',
        method: 'GET'
      };
      instance = new HttpFlood(params);
    });

    it('Calls _addReport() for report message', () => {
      const spy = sinon.spy(instance, '_addReport');
      instance._threadMeassageHandler({
        cmd: 'report',
        success: true
      });
      assert.isTrue(spy.called);
    });

    it('Calls _handleFinished() for end message', () => {
      const spy = sinon.spy(instance, '_handleFinished');
      instance._threadMeassageHandler({
        cmd: 'finished'
      });
      assert.isTrue(spy.called);
    });

    it('Does nothing when aborted', () => {
      instance.aborted = true;
      const spy = sinon.spy(instance, '_handleFinished');
      instance._threadMeassageHandler({
        cmd: 'finished'
      });
      assert.isFalse(spy.called);
    });
  });

  describe('_threadErrorHandler()', () => {
    let instance;
    beforeEach(() => {
      const params = {
        url: 'http://domain.com',
        method: 'GET'
      };
      instance = new HttpFlood(params);
    });

    it('Increments threadsFinished', () => {
      instance._threadErrorHandler();
      assert.equal(instance.threadsFinished, 1);
    });

    it('Calls _tryReport()', () => {
      const spy = sinon.spy(instance, '_tryReport');
      instance._threadErrorHandler();
      assert.isTrue(spy.called);
    });
  });

  describe('_addReport()', () => {
    let instance;
    beforeEach(() => {
      const params = {
        url: 'http://domain.com',
        method: 'GET'
      };
      instance = new HttpFlood(params);
    });

    it('Increments denial count', () => {
      instance._addReport({
        critical: true
      });
      assert.equal(instance.report.denial, 1);
    });

    it('Increments failure count', () => {
      instance._addReport({
        error: true
      });
      assert.equal(instance.report.failure, 1);
    });

    it('Increments success count', () => {
      instance._addReport({
        success: true
      });
      assert.equal(instance.report.success, 1);
    });

    it('Adds a report to the list of reports', () => {
      const report = {
        success: true
      };
      instance._addReport(report, 0);
      assert.deepEqual(instance.report.data[0], [report]);
    });

    it('Adds a report to the thread index', () => {
      const report = {
        success: true
      };
      instance._addReport(report, 1);
      assert.deepEqual(instance.report.data[1], [report]);
    });

    it('Emitts request-finished event', () => {
      const report = {
        success: true
      };
      let data;
      instance.once('request-finished', (msg) => data = msg);
      instance._addReport(report);
      assert.deepEqual(data, report);
    });
  });

  describe('_handleFinished()', () => {
    let instance;
    beforeEach(() => {
      const params = {
        url: 'http://domain.com',
        method: 'GET'
      };
      instance = new HttpFlood(params);
    });

    it('Increments threadsFinished', () => {
      instance._handleFinished();
      assert.equal(instance.threadsFinished, 1);
    });

    it('Calls _tryReport()', () => {
      const spy = sinon.spy(instance, '_tryReport');
      instance._handleFinished();
      assert.isTrue(spy.called);
    });
  });

  describe('_tryReport()', () => {
    let instance;
    beforeEach(() => {
      const params = {
        url: 'http://domain.com',
        method: 'GET'
      };
      instance = new HttpFlood(params);
    });

    it('Calls killThreads()', () => {
      const spy = sinon.spy(instance, 'killThreads');
      instance.threadsFinished = 1;
      instance.threads = [{send: () => {}, kill: () => {}}];
      instance._tryReport();
      assert.isTrue(spy.called);
    });

    it('Emitts execution-finished', () => {
      let data;
      instance.once('execution-finished', (msg) => data = msg);
      instance.threadsFinished = 1;
      instance.threads = [{send: () => {}, kill: () => {}}];
      instance._tryReport();
      assert.typeOf(data, 'object');
    });

    it('Does nothing when aborted', () => {
      const spy = sinon.spy(instance, 'killThreads');
      instance.threadsFinished = 1;
      instance.threads = [{send: () => {}, kill: () => {}}];
      instance.aborted = true;
      instance._tryReport();
      assert.isFalse(spy.called);
    });

    it('Does nothing when finished cound does not match threads count', () => {
      const spy = sinon.spy(instance, 'killThreads');
      instance.threadsFinished = 0;
      instance.threads = [{send: () => {}, kill: () => {}}];
      instance.aborted = true;
      instance._tryReport();
      assert.isFalse(spy.called);
    });
  });
});
