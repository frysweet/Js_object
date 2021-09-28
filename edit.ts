import { ModuleConfig } from '../types';

/**
 * Apply polyfills
 */
import '@babel/register';

import 'components/polyfills';
import Core from './components/core';
import * as _ from './components/utils';

declare const VERSION: string;

/**
 *
 * Short Description (눈_눈;)
 *
 */
export default class ModuleJS {
  /**
   * Promise that resolves when core modules are ready and UI is rendered on the page
   */
  public isReady: Promise<void>;

  /**
   * Stores destroy method implementation.
   * Clear heap occupied by Module and remove UI components from the DOM.
   */
  public destroy: () => void;

  /** Module version */
  public static get version(): string {
    return VERSION;
  }

  /**
   * @param {ModuleConfig|string|undefined} [configuration] - user configuration
   */
  constructor(configuration?: ModuleConfig|string) {
    /**
     * Set default onReady function
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    let onReady = (): void => {};

    /**
     * If `onReady` was passed in `configuration` then redefine onReady function
     */
    if (_.isObject(configuration) && _.isFunction(configuration.onReady)) {
      onReady = configuration.onReady;
    }

    /**
     * Create a Module.js instance
     */
    const Module = new Core(configuration);

    /**
     * We need to export isReady promise in the constructor
     * as it can be used before other API methods are exported
     *
     * @type {Promise<void>}
     */
    this.isReady = Module.isReady.then(() => {
      this.exportAPI(Module);
      onReady();
    });
  }

  /**
   * Export external API methods
   *
   * @param {Core} Module — Module's instance
   */
  public exportAPI(Module: Core): void {
    const fieldsToExport = [ 'configuration' ];
    const destroy = (): void => {
      Object.values(Module.moduleInstances)
        .forEach((moduleInstance) => {
          if (_.isFunction(moduleInstance.destroy)) {
            moduleInstance.destroy();
          }
          moduleInstance.listeners.removeAll();
        });

      Module = null;

      for (const field in this) {
        if (Object.prototype.hasOwnProperty.call(this, field)) {
          delete this[field];
        }
      }

      Object.setPrototypeOf(this, null);
    };

    fieldsToExport.forEach((field) => {
      this[field] = Module[field];
    });

    this.destroy = destroy;

    Object.setPrototypeOf(this, Module.moduleInstances.API.methods);

    delete this.exportAPI;

  }
}