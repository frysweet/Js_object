import $ from './dom';
import * as _ from './utils';
import { Config, SanitizerConfig } from '../../types';
import { Modules } from '../types-internal/-modules';
import I18n from './i18n';
import { CriticalError } from './errors/critical';
import EventsDispatcher from './utils/events';

/**
 * @typedef {Core} Core

/**
 * Require  modules places in components/modules dir
 */
const contextRequire = require.context('./modules', true);

const modules = [];

contextRequire.keys().forEach((filename) => {
  /**
   * Include files if:
   * - extension is .js or .ts
   */
  if (filename.match(/^\.\/[^_][\w/]*\.([tj])s$/)) {
    modules.push(contextRequire(filename));
  }
});

/**
 * @class Core
 *
 *
 * @property {Config} config - all settings
 * @property {Modules} moduleInstances - constructed  components
 *
 * @type {Core}
 */
export default class Core {
  
  public config: Config;

  /**
   * Object with core modules instances
   */
  public moduleInstances: Modules = {} as Modules;

  /**
   * Promise that resolves when all core modules are prepared and UI is rendered on the page
   */
  public isReady: Promise<void>;

  /**
   * Event Dispatcher util
   */
  private eventsDispatcher: EventsDispatcher = new EventsDispatcher();

  /**
   * @param {Config} config - user configuration
   *
   */
  constructor(config?: Config|string) {
    /**
     * Ready promise. Resolved if it is ready to work, rejected otherwise
     */
    let onReady, onFail;

    this.isReady = new Promise((resolve, reject) => {
      onReady = resolve;
      onFail = reject;
    });

    Promise.resolve()
      .then(async () => {
        this.configuration = config;

        await this.validate();
        await this.init();
        await this.start();

        _.logLabeled('I\'m ready!');

        setTimeout(async () => {
          await this.render();

          if ((this.configuration as Config).autofocus) {
            const { BlockManager, Caret } = this.moduleInstances;

            Caret.setToBlock(BlockManager.blocks[0], Caret.positions.START);
            BlockManager.highlightCurrentNode();
          }

          /**
           * Resolve this.isReady promise
           */
          onReady();
        }, 500);
      })
      .catch((error) => {
        _.log(`.js is not ready because of ${error}`, 'error');

        /**
         * Reject this.isReady promise
         */
        onFail(error);
      });
  }

  /**
   * Setting for configuration
   *
   * @param {Config|string} config - config to set
   */
  public set configuration(config: Config|string) {
    /**
     * Place config into the class property
     *
     * @type {Config}
     */
    if (_.isObject(config)) {
      this.config = {
        ...config,
      };
    } else {
      /**
       * Process zero-configuration or with only holderId
       * Make config object
       */
      this.config = {
        holder: config,
      };
    }

  }


  public get configuration(): Config|string {
    return this.config;
  }

  /**
   * Checks for required fields in 's config
   *
   * @returns {Promise<void>}
   */
  public async validate(): Promise<void> {
    const { holderId, holder } = this.config;

    if (holderId && holder) {
      throw Error('«holderId» and «holder» param can\'t assign at the same time.');
    }

    /**
     * Check for a holder element's existence
     */
    if (_.isString(holder) && !$.get(holder)) {
      throw Error(`element with ID «${holder}» is missing. Pass correct holder's ID.`);
    }

    if (holder && _.isObject(holder) && !$.isElement(holder)) {
      throw Error('«holder» value must be an Element node');
    }
  }

  
  /**
   * Initializes modules:
   *  - make and save instances
   *  - configure
   */
  public init(): void {
    /**
     * Make modules instances and save it to the @property this.moduleInstances
     */
    this.constructModules();

    /**
     * Modules configuration
     */
    this.configureModules();
  }

  /**
   *
   * Get list of modules that needs to be prepared and return a sequence (Promise)
   *
   * @returns {Promise<void>}
   */
  public async start(): Promise<void> {
    const modulesToPrepare = [
      'Tools',
      'UI',
      'BlockManager',
      'Paste',
      'BlockSelection',
      'RectangleSelection',
      'CrossBlockSelection',
      'ReadOnly',
    ];

    await modulesToPrepare.reduce(
      (promise, module) => promise.then(async () => {
        // _.log(`Preparing ${module} module`, 'time');

        try {
          await this.moduleInstances[module].prepare();
        } catch (e) {
          /**
           * CriticalError's will not be caught
           */
          if (e instanceof CriticalError) {
            throw new Error(e.message);
          }
          _.log(`Module ${module} was skipped because of %o`, 'warn', e);
        }
        // _.log(`Preparing ${module} module`, 'timeEnd');
      }),
      Promise.resolve()
    );
  }

  /**
   * Render initial data
   */
  private render(): Promise<void> {
    return this.moduleInstances.Renderer.render(this.config.data.blocks);
  }

  /**
   * Make modules instances and save it to the @property this.moduleInstances
   */
  private constructModules(): void {
    modules.forEach((module) => {
      /**
       * If module has non-default exports, passed object contains them all and default export as 'default' property
       */
      const Module = _.isFunction(module) ? module : module.default;

      try {
        /**
         * We use class name provided by displayName property
         *
         * On build, Babel will transform all Classes to the Functions so, name will always be 'Function'
         * To prevent this, we use 'babel-plugin-class-display-name' plugin
         *
         * @see  https://www.npmjs.com/package/babel-plugin-class-display-name
         */
        this.moduleInstances[Module.displayName] = new Module({
          config: this.configuration,
          eventsDispatcher: this.eventsDispatcher,
        });
      } catch (e) {
        _.log(`Module ${Module.displayName} skipped because`, 'warn', e);
      }
    });
  }

  /**
   * Modules instances configuration:
   *  - pass other modules to the 'state' property
   *  - ...
   */
  private configureModules(): void {
    for (const name in this.moduleInstances) {
      if (Object.prototype.hasOwnProperty.call(this.moduleInstances, name)) {
        /**
         * Module does not need self-instance
         */
        this.moduleInstances[name].state = this.getModulesDiff(name);
      }
    }
  }

  /**
   * Return modules without passed name
   *
   * @param {string} name - module for witch modules difference should be calculated
   */
  private getModulesDiff(name: string): Modules {
    const diff = {} as Modules;

    for (const moduleName in this.moduleInstances) {
      /**
       * Skip module with passed name
       */
      if (moduleName === name) {
        continue;
      }
      diff[moduleName] = this.moduleInstances[moduleName];
    }

    return diff;
  }
}