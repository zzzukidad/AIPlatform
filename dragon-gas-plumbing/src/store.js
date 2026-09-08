'use strict';

/**
 * Tiny JSON file store with atomic writes and serialised mutations.
 * Data lives in /data (gitignored) so uploads survive restarts without a DB.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class JsonStore {
  constructor(file, defaultsFactory) {
    this.file = path.join(DATA_DIR, file);
    this.defaultsFactory = defaultsFactory;
    this._data = null;
    this._queue = Promise.resolve();
  }

  load() {
    ensureDataDir();
    try {
      this._data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      this._data = this.defaultsFactory ? this.defaultsFactory() : {};
      this._saveSync();
    }
    return this._data;
  }

  get data() {
    if (!this._data) this.load();
    return this._data;
  }

  _saveSync() {
    ensureDataDir();
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  /** Serialise async mutations so concurrent requests never corrupt the file. */
  mutate(fn) {
    const run = () =>
      Promise.resolve()
        .then(() => fn(this.data))
        .then(() => {
          this._saveSync();
        });
    this._queue = this._queue.then(run, run);
    return this._queue;
  }
}

module.exports = { JsonStore, DATA_DIR, ensureDataDir };
