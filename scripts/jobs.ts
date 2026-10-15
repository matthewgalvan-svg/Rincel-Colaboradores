/** Ejecuta una vez los trabajos periódicos (vencimientos, conciliación, guías, correos). */
import { closeDb } from "@/db";
import { runJobs } from "@/lib/jobs";

runJobs()
  .then(async (r) => {
    console.log(JSON.stringify(r));
    await closeDb();
  })
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });
