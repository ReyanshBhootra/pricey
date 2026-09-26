// Pushes the seed data to Firestore. Run once after filling in .env.local:
//   npm run seed
import { doc, writeBatch } from "firebase/firestore";
import { COLLECTIONS, getDb } from "../src/lib/firebase";
import { SEED_FORUM_POSTS, SEED_ITEMS, SEED_REPORTS, SEED_STORES } from "../src/lib/seed";

async function main() {
  const db = getDb();
  if (!db) throw new Error("Firebase env vars missing. Copy .env.example to .env.local and fill it in.");

  const groups = [
    [COLLECTIONS.stores, SEED_STORES],
    [COLLECTIONS.items, SEED_ITEMS],
    [COLLECTIONS.reports, SEED_REPORTS],
    [COLLECTIONS.forumPosts, SEED_FORUM_POSTS],
  ] as const;

  for (const [name, rows] of groups) {
    // Firestore batches cap at 500 writes.
    for (let i = 0; i < rows.length; i += 450) {
      const batch = writeBatch(db);
      for (const { id, ...rest } of rows.slice(i, i + 450)) batch.set(doc(db, name, id), rest);
      await batch.commit();
    }
    console.log(`${name}: ${rows.length}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
