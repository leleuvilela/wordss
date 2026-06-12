import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import type { Position } from "./types";

export interface FoundWordEntry {
  wordId: string;
  word: string;
  coords: Position[];
}

export class GameStorage {
  private db: Database;

  constructor(path: string = process.env.DATA_PATH ?? "data/wordss.sqlite") {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS found_words (
        word_id  TEXT PRIMARY KEY,
        word     TEXT NOT NULL,
        coords   TEXT NOT NULL,
        found_at INTEGER NOT NULL
      )
    `);
  }

  loadFoundWords(): FoundWordEntry[] {
    const rows = this.db
      .query("SELECT word_id, word, coords FROM found_words ORDER BY found_at")
      .all() as Array<{ word_id: string; word: string; coords: string }>;

    return rows.map((row) => ({
      wordId: row.word_id,
      word: row.word,
      coords: JSON.parse(row.coords) as Position[],
    }));
  }

  saveFoundWord(entry: FoundWordEntry): void {
    this.db
      .query(
        "INSERT OR IGNORE INTO found_words (word_id, word, coords, found_at) VALUES (?, ?, ?, ?)",
      )
      .run(entry.wordId, entry.word, JSON.stringify(entry.coords), Date.now());
  }

  close(): void {
    this.db.close();
  }
}
