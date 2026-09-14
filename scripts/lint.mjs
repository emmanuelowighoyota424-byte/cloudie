import fs from 'node:fs'
import path from 'node:path'

const roots = ['app','components','lib','realtime','scripts','tests']
const extensions = new Set(['.ts','.tsx','.mjs','.js'])
const ignored = new Set(['node_modules','.next','.git'])
const files=[]
function walk(dir){if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(ignored.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(extensions.has(path.extname(entry.name))&&!full.endsWith(path.join('scripts','lint.mjs')))files.push(full)}}
for(const root of roots)walk(root)
const failures=[]
for(const file of files){const source=fs.readFileSync(file,'utf8');source.split(/\r?\n/).forEach((line,index)=>{if(/\b(TODO|FIXME|XXX)\b/.test(line))failures.push(`${file}:${index+1}: unresolved TODO/FIXME marker`);if(new RegExp(String.raw`\b${'alert'}\s*\(`).test(line))failures.push(`${file}:${index+1}: browser alert is not production-safe`)})}
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`Cloudie static lint passed (${files.length} source files scanned).`)
