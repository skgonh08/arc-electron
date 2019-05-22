const runner = require('../../../scripts/packages/ddos/main/flood-runner');
const {assert} = require('chai');
// const http = require('http');
const sinon = require('sinon');

describe.only('Flood runner', () => {
  describe('abort()', () => {
    afterEach(() => {
      runner.aborted = false;
      runner.currentRequest = undefined;
      runner.execTimeout = undefined;
    });

    it('Sets aborted flag', () => {
      runner.abort();
      assert.isTrue(runner.aborted);
    });

    it('Calls abort() on currentRequest', () => {
      runner.currentRequest = {
        abort: () => {}
      };
      const spy = sinon.spy(runner.currentRequest, 'abort');
      runner.abort();
      assert.isTrue(spy.called);
    });

    it('Clears execution timeout', () => {
      runner.execTimeout = 1;
      const spy = sinon.spy(global, 'clearTimeout');
      runner.abort();
      assert.isTrue(spy.called);
    });

    it('Clears execTimeout', () => {
      runner.execTimeout = 1;
      runner.abort();
      assert.isUndefined(runner.execTimeout);
    });
  });

  describe('next()', () => {
    afterEach(() => {
      runner.current = 0;
      runner.sample = 0;
      runner.aborted = false;
      runner.hasSample = false;
      runner.delay = 1;
    });

    it('Increments "current" proeprty', () => {
      runner.current = 0;
      runner.delay = 200;
      runner.next();
      runner.abort();
      assert.equal(runner.current, 1);
    });

    it('Calls _execute() after the timeout', (done) => {
      const origExe = runner._execute;
      const origNext = runner.next;
      runner._execute = () => {};
      const spy = sinon.spy(runner, '_execute');
      runner.next();
      runner.next = () => {};
      setTimeout(() => {
        runner._execute = origExe;
        runner.next = origNext;
        assert.isTrue(spy.called);
        done();
      });
    });

    it('Calls next() after the timeout', (done) => {
      const origExe = runner._execute;
      const origNext = runner.next;
      runner._execute = () => {};
      runner.next();
      runner.next = () => {};
      const spy = sinon.spy(runner, 'next');
      setTimeout(() => {
        runner._execute = origExe;
        runner.next = origNext;
        assert.isTrue(spy.called);
        done();
      });
    });

    it('Does nothing when aborted', () => {
      runner.aborted = true;
      runner.next();
      assert.equal(runner.current, 0);
    });

    it('Does nothing when sample equals number of requests', () => {
      runner.hasSample = true;
      runner.current = 1;
      runner.sample = 1;
      runner.next();
      assert.equal(runner.current, 1);
    });
  });
});
