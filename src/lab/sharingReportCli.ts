/** Prints a local report; this data is never exposed through public routes. */
import * as path from 'node:path';
import { GameStore } from '../store/store.js';
import { sharingReport } from './sharingReport.js';
console.log(JSON.stringify(sharingReport(GameStore.open(path.resolve(process.argv[2] ?? 'data'))), null, 2));
