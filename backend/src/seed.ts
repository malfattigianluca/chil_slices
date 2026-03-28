/**
 * Script de seed inicial.
 * Ejecutar con: npm run prisma:seed
 */
import { ensureDefaultAdmin } from './modules/auth/auth.service';
import prisma from './prisma';

async function main() {
  await ensureDefaultAdmin();
  console.log('✅ Seed completado');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
