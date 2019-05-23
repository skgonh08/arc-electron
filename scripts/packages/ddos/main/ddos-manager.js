const {ipcMain} = require('electron');
const {HttpFlood} = require('./http-flood');
/**
 * A class to be running in the IO thread and listen for main bus events
 * related to DDoS simulation.
 */
class DdosManager {
  constructor() {
    this._runHandler = this._runHandler.bind(this);
    this._abortHandler = this._abortHandler.bind(this);

    this.queue = {};
  }
  /**
   * Listens on the main event bus for `ddos-*` events
   */
  listen() {
    ipcMain.on('ddos-run', this._runHandler);
    ipcMain.on('ddos-abort', this._abortHandler);
  }
  /**
   * Removes previously attached events.
   */
  unlisten() {
    ipcMain.removeListener('ddos-run', this._runHandler);
    ipcMain.removeListener('ddos-abort', this._abortHandler);
  }
  /**
   * Handler for the `ddos-run` event. Runs simulation defined by `type` property.
   * @param {String} type Simulation type.
   * @param {Number} id Simulation id.
   * @param {Object} options Options to pass to the simulation.
   */
  _runHandler(type, id, options) {
    switch (type) {
      case 'http-flood': this._runHttpFlood(id, options); break;
    }
  }
  /**
   * Removes simulation instance from the queue and returns it.
   * This also removes event listeners from the instance.
   * @param {Number} id Simulation ID.
   * @return {Object|undefined} Removed simulation or `undefined` if not found.
   */
  _removeInstance(id) {
    const instance = this.queue[id];
    if (!instance) {
      return;
    }
    delete this.queue[id];
    instance.removeAllListeners('request-finished');
    instance.removeAllListeners('execution-finished');
    return instance;
  }
  /**
   * Handler for the `ddos-abort` event. Aborts simulation instance.
   * @param {Number} id Simulation ID.
   */
  _abortHandler(id) {
    const instance = this._removeInstance(id);
    if (instance) {
      instance.abort();
    }
  }
  /**
   * Runs HTTP flood simulation.
   * @param {Number} id Simulation ID.
   * @param {Object} options Options to pass to the simulation.
   */
  _runHttpFlood(id, options) {
    try {
      const instance = new HttpFlood(options);
      this.queue[id] = instance;
      instance.on('request-finished', this._httpFloodRequestHandler.bind(this, id));
      instance.on('execution-finished', this._httpFloodExeHandler.bind(this, id));
      instance.execute();
    } catch (e) {
      ipcMain.send('ddos-error', id, e.message);
    }
  }
  /**
   * Handler for the `request-finished` event from the simulation.
   * @param {Number} id Simulation ID
   * @param {Object} report Request execution report
   * @param {Number} threadIndex If supported, index of a thread that executed the simulation.
   */
  _httpFloodRequestHandler(id, report, threadIndex) {
    ipcMain.send('ddos-request-result', 'http-flood', id, report, threadIndex);
  }
  /**
   * Handler for the `execution-finished` event from the simulation.
   * @param {Number} id Simulation ID
   * @param {Object} report Request execution report
   */
  _httpFloodExeHandler(id, report) {
    this._removeInstance(id);
    ipcMain.send('ddos-result', 'http-flood', id, report);
  }
}
module.exports.DdosManager = DdosManager;
