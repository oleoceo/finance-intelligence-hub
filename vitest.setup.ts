// Production Database Guardrail
// This setup file runs before all tests and aborts if finance_hub_prod is detected
// to prevent accidental data loss or corruption in Production.

const checkProductionDatabase = () => {
  const databaseUrl = process.env.DATABASE_URL || '';
  const pgDatabase = process.env.PGDATABASE || '';

  if (databaseUrl.includes('finance_hub_prod')) {
    throw new Error(
      'Test execution aborted - detected finance_hub_prod in DATABASE_URL. ' +
        'Tests must never target the production database. Use an isolated test database instead.',
    );
  }

  if (pgDatabase === 'finance_hub_prod') {
    throw new Error(
      'Test execution aborted - detected finance_hub_prod in PGDATABASE. ' +
        'Tests must never target the production database. Use an isolated test database instead.',
    );
  }
};

// Run guardrail check immediately when this module is loaded
checkProductionDatabase();
