// Minimal ZIP writer (stored entries, no compression). Pure Node.
function crc32(buf) {
  let table = crc32._t;
  if (!table) {
    table = crc32._t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

/**
 * files: [{path, content(Buffer|string)}] → Buffer of a valid .zip
 */
function writeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const enc = (s) => Buffer.from(s, 'utf8');

  for (const f of files) {
    const nameBytes = enc(f.path);
    const data = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    const crc = crc32(data);
    const { time, date } = dosTime(new Date(f.mtime || Date.now()));

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // sig
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(0, 8);            // method: stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed
    local.writeUInt32LE(data.length, 22); // uncompressed
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);           // extra len
    chunks.push(local, nameBytes, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);   // version made by
    cd.writeUInt16LE(20, 6);   // version needed
    cd.writeUInt16LE(0, 8);    // flags
    cd.writeUInt16LE(0, 10);   // method
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt32LE(0, 30);   // extra
    cd.writeUInt32LE(0, 32);   // comment
    cd.writeUInt32LE(0, 34);   // disk
    cd.writeUInt16LE(0, 36);   // internal attrs
    cd.writeUInt32LE(0, 38);   // external attrs
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(cd, nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...central, end]);
}

module.exports = { writeZip, crc32 };
