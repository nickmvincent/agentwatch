import { createServiceLogger, startService } from "@aw-clean/core";
import { SERVICE_NAME, createRunsService } from "./service";

await startService(SERVICE_NAME, {
  requireWriter: true,
  createApp: ({ settings, logger, enableHttpLogs, writer }) => {
    const { logger: outputLogger, logPath: outputLogPath } =
      createServiceLogger(settings, SERVICE_NAME, "output");

    const { app, websocket } = createRunsService({
      settings,
      logger,
      writer: writer!,
      outputLogger,
      enableHttpLogs
    });

    return { app, websocket, logPaths: { "output log file": outputLogPath } };
  },
  registerReload: true
});
