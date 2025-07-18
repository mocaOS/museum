export async function up(knex) {
  // create custom index for nfts on field "indentifier" sort DESC
  await knex.schema.raw(`
      CREATE INDEX nfts_identifier_desc_idx ON nfts (identifier DESC);
  `);
}

export async function down(knex) {
  await knex.schema.raw(`
      DROP INDEX nfts_identifier_desc_idx ON nfts;
  `);
}
