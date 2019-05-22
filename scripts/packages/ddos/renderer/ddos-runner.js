const ipcRenderer = require('electron').ipcRenderer;

/**
 * A class that communicates with main thread to run DDoS simulator.
 */
class DdosRunner {
  constructor() {
    this.requestId = Math.rand();
    this.callbacks = {};

    this._resultHandler = this._resultHandler.bind(this);
    this._requestResultHandler = this._requestResultHandler.bind(this);
    ipcRenderer.on('ddos-result', this._resultHandler);
    ipcRenderer.on('ddos-request-result', this._requestResultHandler);
  }

  unlisten() {
    ipcRenderer.removeListener('ddos-result', this._resultHandler);
    ipcRenderer.removeListener('ddos-request-result', this._requestResultHandler);
  }

  runHttpFlood(options, requestEndCallback, finishedCallback) {
    ipcRenderer.send('ddos-run', 'http-flood', this.requestId, options);
    this.callbacks.httpFlood = [requestEndCallback, finishedCallback];
  }

  _resultHandler(type, id, report) {
    if (id !== this.requestId) {
      return;
    }
    switch (type) {
      case 'http-flood':
        if (this.callbacks.httpFlood && this.callbacks.httpFlood[1]) {
          this.callbacks.httpFlood[1](report);
          delete this.callbacks.httpFlood;
        }
      break;
    }
  }

  _requestResultHandler(type, id, report) {
    if (id !== this.requestId) {
      return;
    }
    switch (type) {
      case 'http-flood':
        if (this.callbacks.httpFlood && this.callbacks.httpFlood[0]) {
          this.callbacks.httpFlood[0](report);
        }
        break;
    }
  }
}
exports.DdosRunner = DdosRunner;
