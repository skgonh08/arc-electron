const ipcRenderer = require('electron').ipcRenderer;
/**
 * A class that communicates with main thread to run DDoS simulator.
 *
 * ## API
 *
 * To simulate HTTP flood call `runHttpFlood()` function with required parameters
 * (see method description for details).
 *
 * ```javascript
 * const options = {
 *  url: 'https://domain.com',
 *  method: 'GET',
 *  sample: 1000,
 *  threads: 3
 * };
 * const id = runner.runHttpFlood(options, (report, threadIndex, id) => {
 *  // Single request has ended
 * }, (report, id) => {
 *  // Simulation has ended. This won't be called when `sample` is not set.
 * });
 *
 * // Use `id` to cancel the simulation.
 * runner.abortHttpFlood(id);
 * ```
 *
 * When simulation is aborted then final callback is not executed.
 *
 * ## Web event's API.
 *
 * To execute HTTP flood symulation:
 *
 * ```javascript
 * const detail = {
 *  type: 'http-flood',
 *  url: 'https://domain.com',
 *  method: 'GET',
 *  sample: 1000,
 *  threads: 3
 * };
 *
 * document.body.dispatchEvent(new CustomEvent('ddos-run', {
 *  composed: true,
 *  bubbles: true,
 *  detail
 * }));
 *
 * const id = detail.id;
 * // Listen for simulation end event
 * window.addEventListener('ddos-result', (e) => {
 *  if (e.detail.id === id) {
 *    // this is our response
 *    console.log(e.detail.report);
 *  }
 * });
 *
 * // Listen for request end event
 * window.addEventListener('ddos-request-result', (e) => {
 *  if (e.detail.id === id) {
 *    // this is our response
 *    console.log(e.detail.report);
 *    console.log(e.detail.threadIndex);
 *  }
 * });
 *
 * // To cancel the simulation
 * document.body.dispatchEvent(new CustomEvent('ddos-abort', {
 *  composed: true,
 *  bubbles: true,
 *  detail: {
 *    type: 'http-flood',
 *    id
 *  }
 * }));
 * ```
 */
class DdosRunner {
  constructor() {
    this.callbacks = {};

    this._resultHandler = this._resultHandler.bind(this);
    this._requestResultHandler = this._requestResultHandler.bind(this);
    this._webRunHandler = this._webRunHandler.bind(this);
    this._webAbortHandler = this._webAbortHandler.bind(this);
  }
  /**
   * Initializes events on both IO event bus and on the window object.
   */
  listen() {
    ipcRenderer.on('ddos-result', this._resultHandler);
    ipcRenderer.on('ddos-request-result', this._requestResultHandler);

    window.addEventListener('ddos-run', this._webRunHandler);
    window.addEventListener('ddos-abort', this._webAbortHandler);
  }
  /**
   * Removes previously attached events from IO event bus and the document.
   */
  unlisten() {
    ipcRenderer.removeListener('ddos-result', this._resultHandler);
    ipcRenderer.removeListener('ddos-request-result', this._requestResultHandler);

    window.removeEventListener('ddos-run', this._webRunHandler);
    window.removeEventListener('ddos-abort', this._webAbortHandler);
  }
  /**
   * Handler for the `ddos-run` web event.
   * @param {CustomEvent} e See class decription for more info
   */
  _webRunHandler(e) {
    e.preventDefault();
    const {type} = e.detail;
    switch (type) {
      case 'http-flood': e.detail.result = this._handleHttpFloodWebEvent(e); break;
    }
  }
  /**
   * Handler for the `ddos-abort` web event.
   * @param {CustomEvent} e See class decription for more info
   */
  _webAbortHandler(e) {
    e.preventDefault();
    const {type, id} = e.detail;
    switch (type) {
      case 'http-flood': e.detail.result = this.abortHttpFlood(id); break;
    }
  }
  /**
   * Function that handles `ddos-run` for `http-flood` type.
   * @param {CustomEvent} e See class decription for more info
   * @return {Number} Generated simulation ID.
   */
  _handleHttpFloodWebEvent(e) {
    const requestEnd = (report, threadIndex, id) => {
      document.body.dispatchEvent(new CustomEvent('ddos-request-result', {
        composed: true,
        bubbles: true,
        detail: {
          id,
          report,
          threadIndex,
          type: 'http-flood'
        }
      }));
    };
    const simulationEnd = (report, id) => {
      document.body.dispatchEvent(new CustomEvent('ddos-result', {
        composed: true,
        bubbles: true,
        detail: {
          id,
          report,
          type: 'http-flood'
        }
      }));
    };
    return this.runHttpFlood(e.detail, requestEnd, simulationEnd);
  }
  /**
   * Asks IO thread to run HTTP flood simulator.
   * @param {Object} options HTTP flood simulator options:
   * - url - String. The url to flood with requests
   * - method - String. HTTP method.
   * - payload - String. Message to send. Optional. Unset for GET and HEAD requests.
   * - headers - Object. A map of headers to set with request.
   * - sample - Number. A number of requests to make. 0 for nulimited.
   * - delay - Number. A number of milliseconds between a request.
   * - threads - Number. Number of threads to use to run the request. More threads means
   * more pararell requests but also more resources used.
   * @param {?Function} requestEndCallback Function called each time a request finishes.
   * @param {?Function} finishedCallback Function called when timulation finish.
   * Note, this function is not called when the simulation is aborted.
   * @return {Number} The ID of the simulation. Use it to abort simulation by calling `abortHttpFlood(id)`
   */
  runHttpFlood(options, requestEndCallback, finishedCallback) {
    const id = Math.random();
    if (!this.callbacks.httpFlood) {
      this.callbacks.httpFlood = {};
    }
    this.callbacks.httpFlood[id] = [requestEndCallback, finishedCallback];
    ipcRenderer.send('ddos-run', 'http-flood', id, options);
    return id;
  }
  /**
   * Aborts simulation and clears listeners.
   * @param {Number} id Simulation ID returned by `runHttpFlood()`.
   */
  abortHttpFlood(id) {
    ipcRenderer.send('ddos-abort', id);
    if (this.callbacks.httpFlood) {
      delete this.callbacks.httpFlood[id];
    }
  }
  /**
   * Handler for the `ddos-result` IO event. Propagates report to corresponding callbacks.
   * @param {String} type Simulation type.
   * @param {Number} id Simulation ID.
   * @param {Object} report A report to send back to requesting logic.
   */
  _resultHandler(type, id, report) {
    switch (type) {
      case 'http-flood':
        this._httpFloodResultHandler(id, report);
        break;
    }
  }
  /**
   * Handler for the `ddos-request-result` IO event. Propagates request report
   * to corresponding listeners.
   * @param {String} type Simulation type.
   * @param {Number} id Simulation ID.
   * @param {Object} report A report to send back to requesting logic.
   * @param {?Number} threadIndex If the simulation support threads then it is
   * the index of the thread that executed the request.
   */
  _requestResultHandler(type, id, report, threadIndex) {
    switch (type) {
      case 'http-flood':
        this._httpFloodRequestHandler(id, report, threadIndex);
        break;
    }
  }
  /**
   * Handler for the HTTP food simulation result.
   * @param {Number} id Simulation ID.
   * @param {Object} report A report to send back to requesting logic.
   */
  _httpFloodResultHandler(id, report) {
    const callbacks = this.callbacks.httpFlood && this.callbacks.httpFlood[id];
    if (!callbacks) {
      console.warn('DDoS flood result called but callbacks are not set.');
      return;
    }
    if (callbacks[1]) {
      try {
        callbacks[1](report, id);
      } catch (e) {
        console.error(e);
      }
    }
    delete this.callbacks.httpFlood[id];
  }
  /**
   * Handler for the HTTP food simulation request result.
   * @param {Number} id Simulation ID.
   * @param {Object} report A report to send back to requesting logic.
   * @param {Number} threadIndex Index of the thread that executed the request.
   */
  _httpFloodRequestHandler(id, report, threadIndex) {
    const callbacks = this.callbacks.httpFlood && this.callbacks.httpFlood[id];
    if (!callbacks) {
      console.warn('DDoS flood request result called but callbacks are not set.');
      return;
    }
    if (callbacks[0]) {
      try {
        callbacks[0](report, threadIndex, id);
      } catch (e) {
        console.error(e);
      }
    }
  }
}
exports.DdosRunner = DdosRunner;
