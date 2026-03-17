const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
    const filePath = path.join(routesDir, file);
    let code = fs.readFileSync(filePath, 'utf8');

    // Add async to handlers
    code = code.replace(/(^|[^a-zA-Z0-9_])(async\s+)?\((req,\s*res(?:,\s*next)?)\)\s*=>\s*\{/g, (match, prefix, isAsync, args) => {
        if (isAsync && isAsync.trim() === 'async') return match;
        return `${prefix}async (${args}) => {`;
    });

    // Add await to db.prepare
    code = code.replace(/(^|[^a-zA-Z0-9_])(await\s+)?(db\.prepare\()/g, (match, prefix, isAwait, dbcall) => {
        if (isAwait && isAwait.trim() === 'await') return match;
        return `${prefix}await ${dbcall}`;
    });

    fs.writeFileSync(filePath, code);
    console.log(`Refactored ${file}`);
});
