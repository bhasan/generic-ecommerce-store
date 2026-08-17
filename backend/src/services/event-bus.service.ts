import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

class EventBusService extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(30);
  }

  publish(event: string, data: any): void {
    logger.debug(`Publishing event: ${event}`, { data });
    this.emit(event, data);
  }

  subscribe(event: string, handlerName: string, handler: (data: any) => Promise<void>): void {
    logger.info(`Registering handler "${handlerName}" for event "${event}"`);
    this.on(event, (data) => {
      handler(data).catch((err) => {
        logger.error(`Handler "${handlerName}" failed for event "${event}"`, err, { data });
      });
    });
  }
}

export const eventBus = new EventBusService();
export default eventBus;
