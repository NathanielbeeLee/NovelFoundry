const fs = require("node:fs");
const path = require("node:path");

const serverRoot = path.resolve(__dirname, "..");
const schemaPaths = {
  postgres: path.join(serverRoot, "src", "prisma", "schema.prisma"),
  sqlite: path.join(serverRoot, "src", "prisma", "schema.sqlite.prisma"),
};

function stripInlineComment(line) {
  return line.replace(/\s+\/\/.*$/, "").trim();
}

function parseSchema(source) {
  const blocks = new Map();
  const lines = source.split(/\r?\n/);
  let current = null;

  for (const rawLine of lines) {
    const line = stripInlineComment(rawLine);
    if (!current) {
      const match = line.match(/^(model|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{$/);
      if (match) {
        current = {
          kind: match[1],
          name: match[2],
          fields: [],
          attributes: [],
        };
      }
      continue;
    }

    if (line === "}") {
      const key = `${current.kind}:${current.name}`;
      blocks.set(key, {
        kind: current.kind,
        name: current.name,
        fields: current.fields.slice().sort(),
        attributes: current.attributes.slice().sort(),
      });
      current = null;
      continue;
    }

    if (!line) continue;
    if (line.startsWith("@@")) {
      current.attributes.push(line.replace(/\s+/g, " "));
    } else {
      current.fields.push(line.replace(/\s+/g, " "));
    }
  }

  if (current) {
    throw new Error(`Unclosed ${current.kind} ${current.name} block.`);
  }
  return blocks;
}

function compareSchemas(leftSource, rightSource) {
  const left = parseSchema(leftSource);
  const right = parseSchema(rightSource);
  const differences = [];

  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const leftBlock = left.get(key);
    const rightBlock = right.get(key);
    if (!leftBlock || !rightBlock) {
      differences.push({ type: "block", key, left: Boolean(leftBlock), right: Boolean(rightBlock) });
      continue;
    }
    if (JSON.stringify(leftBlock.fields) !== JSON.stringify(rightBlock.fields)) {
      differences.push({ type: "fields", key, left: leftBlock.fields, right: rightBlock.fields });
    }
    if (JSON.stringify(leftBlock.attributes) !== JSON.stringify(rightBlock.attributes)) {
      differences.push({ type: "attributes", key, left: leftBlock.attributes, right: rightBlock.attributes });
    }
  }

  return differences.sort((a, b) => a.key.localeCompare(b.key));
}

function checkSchemaParity() {
  const postgres = fs.readFileSync(schemaPaths.postgres, "utf8");
  const sqlite = fs.readFileSync(schemaPaths.sqlite, "utf8");
  return compareSchemas(postgres, sqlite);
}

if (require.main === module) {
  const differences = checkSchemaParity();
  if (differences.length > 0) {
    console.error("Prisma schema parity check failed:");
    console.error(JSON.stringify(differences, null, 2));
    process.exitCode = 1;
  } else {
    console.log("Prisma schema parity check passed: PostgreSQL and SQLite model contracts match.");
  }
}

module.exports = { checkSchemaParity, compareSchemas, parseSchema };
