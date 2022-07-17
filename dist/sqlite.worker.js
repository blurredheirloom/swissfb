(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else {
		var a = factory();
		for(var i in a) (typeof exports === 'object' ? exports : root)[i] = a[i];
	}
})(this, () => {
return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/lazyFile.ts":
/*!*************************!*\
  !*** ./src/lazyFile.ts ***!
  \*************************/
/***/ ((__unused_webpack_module, exports) => {


// adapted from https://github.com/emscripten-core/emscripten/blob/cbc974264e0b0b3f0ce8020fb2f1861376c66545/src/library_fs.js
// flexible chunk size parameter
// Creates a file record for lazy-loading from a URL. XXX This requires a synchronous
// XHR, which is not possible in browsers except in a web worker!
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createLazyFile = exports.LazyUint8Array = void 0;
class LazyUint8Array {
    constructor(config) {
        this.serverChecked = false;
        this.chunks = []; // Loaded chunks. Index is the chunk number
        this.totalFetchedBytes = 0;
        this.totalRequests = 0;
        this.readPages = [];
        // LRU list of read heds, max length = maxReadHeads. first is most recently used
        this.readHeads = [];
        this.lastGet = -1;
        this._chunkSize = config.requestChunkSize;
        this.maxSpeed = Math.round((config.maxReadSpeed || 5 * 1024 * 1024) / this._chunkSize); // max 5MiB at once
        this.maxReadHeads = config.maxReadHeads ?? 3;
        this.rangeMapper = config.rangeMapper;
        this.logPageReads = config.logPageReads ?? false;
        if (config.fileLength) {
            this._length = config.fileLength;
        }
        this.requestLimiter = config.requestLimiter == null ? ((ignored) => { }) : config.requestLimiter;
    }
    /**
     * efficiently copy the range [start, start + length) from the http file into the
     * output buffer at position [outOffset, outOffest + length)
     * reads from cache or synchronously fetches via HTTP if needed
     */
    copyInto(buffer, outOffset, length, start) {
        if (start >= this.length)
            return 0;
        length = Math.min(this.length - start, length);
        const end = start + length;
        let i = 0;
        while (i < length) {
            // {idx: 24, chunkOffset: 24, chunkNum: 0, wantedSize: 16}
            const idx = start + i;
            const chunkOffset = idx % this.chunkSize;
            const chunkNum = (idx / this.chunkSize) | 0;
            const wantedSize = Math.min(this.chunkSize, end - idx);
            let inChunk = this.getChunk(chunkNum);
            if (chunkOffset !== 0 || wantedSize !== this.chunkSize) {
                inChunk = inChunk.subarray(chunkOffset, chunkOffset + wantedSize);
            }
            buffer.set(inChunk, outOffset + i);
            i += inChunk.length;
        }
        return length;
    }
    /* find the best matching existing read head to get the given chunk or create a new one */
    moveReadHead(wantedChunkNum) {
        for (const [i, head] of this.readHeads.entries()) {
            const fetchStartChunkNum = head.startChunk + head.speed;
            const newSpeed = Math.min(this.maxSpeed, head.speed * 2);
            const wantedIsInNextFetchOfHead = wantedChunkNum >= fetchStartChunkNum &&
                wantedChunkNum < fetchStartChunkNum + newSpeed;
            if (wantedIsInNextFetchOfHead) {
                head.speed = newSpeed;
                head.startChunk = fetchStartChunkNum;
                if (i !== 0) {
                    // move head to front
                    this.readHeads.splice(i, 1);
                    this.readHeads.unshift(head);
                }
                return head;
            }
        }
        const newHead = {
            startChunk: wantedChunkNum,
            speed: 1,
        };
        this.readHeads.unshift(newHead);
        while (this.readHeads.length > this.maxReadHeads)
            this.readHeads.pop();
        return newHead;
    }
    /** get the given chunk from cache or fetch it from remote */
    getChunk(wantedChunkNum) {
        let wasCached = true;
        if (typeof this.chunks[wantedChunkNum] === "undefined") {
            wasCached = false;
            // double the fetching chunk size if the wanted chunk would be within the next fetch request
            const head = this.moveReadHead(wantedChunkNum);
            const chunksToFetch = head.speed;
            const startByte = head.startChunk * this.chunkSize;
            let endByte = (head.startChunk + chunksToFetch) * this.chunkSize - 1; // including this byte
            endByte = Math.min(endByte, this.length - 1); // if datalength-1 is selected, this is the last block
            const buf = this.doXHR(startByte, endByte);
            for (let i = 0; i < chunksToFetch; i++) {
                const curChunk = head.startChunk + i;
                if (i * this.chunkSize >= buf.byteLength)
                    break; // past end of file
                const curSize = (i + 1) * this.chunkSize > buf.byteLength
                    ? buf.byteLength - i * this.chunkSize
                    : this.chunkSize;
                // console.log("constructing chunk", buf.byteLength, i * this.chunkSize, curSize);
                this.chunks[curChunk] = new Uint8Array(buf, i * this.chunkSize, curSize);
            }
        }
        if (typeof this.chunks[wantedChunkNum] === "undefined")
            throw new Error("doXHR failed (bug)!");
        const boring = !this.logPageReads || this.lastGet == wantedChunkNum;
        if (!boring) {
            this.lastGet = wantedChunkNum;
            this.readPages.push({
                pageno: wantedChunkNum,
                wasCached,
                prefetch: wasCached ? 0 : this.readHeads[0].speed - 1,
            });
        }
        return this.chunks[wantedChunkNum];
    }
    /** verify the server supports range requests and find out file length */
    checkServer() {
        var xhr = new XMLHttpRequest();
        const url = this.rangeMapper(0, 0).url;
        // can't set Accept-Encoding header :( https://stackoverflow.com/questions/41701849/cannot-modify-accept-encoding-with-fetch
        xhr.open("HEAD", url, false);
        // // maybe this will help it not use compression?
        // xhr.setRequestHeader("Range", "bytes=" + 0 + "-" + 1e12);
        xhr.send(null);
        if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
            throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
        var datalength = Number(xhr.getResponseHeader("Content-length"));
        var hasByteServing = xhr.getResponseHeader("Accept-Ranges") === "bytes";
        const encoding = xhr.getResponseHeader("Content-Encoding");
        var usesCompression = encoding && encoding !== "identity";
        if (!hasByteServing) {
            const msg = "Warning: The server did not respond with Accept-Ranges=bytes. It either does not support byte serving or does not advertise it (`Accept-Ranges: bytes` header missing), or your database is hosted on CORS and the server doesn't mark the accept-ranges header as exposed. This may lead to incorrect results.";
            console.warn(msg, "(seen response headers:", xhr.getAllResponseHeaders(), ")");
            // throw Error(msg);
        }
        if (usesCompression) {
            console.warn(`Warning: The server responded with ${encoding} encoding to a HEAD request. Ignoring since it may not do so for Range HTTP requests, but this will lead to incorrect results otherwise since the ranges will be based on the compressed data instead of the uncompressed data.`);
        }
        if (usesCompression) {
            // can't use the given data length if there's compression
            datalength = null;
        }
        if (!this._length) {
            if (!datalength) {
                console.error("response headers", xhr.getAllResponseHeaders());
                throw Error("Length of the file not known. It must either be supplied in the config or given by the HTTP server.");
            }
            this._length = datalength;
        }
        this.serverChecked = true;
    }
    get length() {
        if (!this.serverChecked) {
            this.checkServer();
        }
        return this._length;
    }
    get chunkSize() {
        if (!this.serverChecked) {
            this.checkServer();
        }
        return this._chunkSize;
    }
    doXHR(absoluteFrom, absoluteTo) {
        console.log(`[xhr of size ${(absoluteTo + 1 - absoluteFrom) / 1024} KiB @ ${absoluteFrom / 1024} KiB]`);
        this.requestLimiter(absoluteTo - absoluteFrom);
        this.totalFetchedBytes += absoluteTo - absoluteFrom;
        this.totalRequests++;
        if (absoluteFrom > absoluteTo)
            throw new Error("invalid range (" +
                absoluteFrom +
                ", " +
                absoluteTo +
                ") or no bytes requested!");
        if (absoluteTo > this.length - 1)
            throw new Error("only " + this.length + " bytes available! programmer error!");
        const { fromByte: from, toByte: to, url, } = this.rangeMapper(absoluteFrom, absoluteTo);
        // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        if (this.length !== this.chunkSize)
            xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
        // Some hints to the browser that we want binary data.
        xhr.responseType = "arraybuffer";
        if (xhr.overrideMimeType) {
            xhr.overrideMimeType("text/plain; charset=x-user-defined");
        }
        xhr.send(null);
        if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
            throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
        if (xhr.response !== undefined) {
            return xhr.response;
        }
        else {
            throw Error("xhr did not return uint8array");
        }
    }
}
exports.LazyUint8Array = LazyUint8Array;
/** create the actual file object for the emscripten file system */
function createLazyFile(FS, parent, name, canRead, canWrite, lazyFileConfig) {
    var lazyArray = new LazyUint8Array(lazyFileConfig);
    var properties = { isDevice: false, contents: lazyArray };
    var node = FS.createFile(parent, name, properties, canRead, canWrite);
    node.contents = lazyArray;
    // Add a function that defers querying the file size until it is asked the first time.
    Object.defineProperties(node, {
        usedBytes: {
            get: /** @this {FSNode} */ function () {
                return this.contents.length;
            },
        },
    });
    // override each stream op with one that tries to force load the lazy file first
    var stream_ops = {};
    var keys = Object.keys(node.stream_ops);
    keys.forEach(function (key) {
        var fn = node.stream_ops[key];
        stream_ops[key] = function forceLoadLazyFile() {
            FS.forceLoadFile(node);
            return fn.apply(null, arguments);
        };
    });
    // use a custom read function
    stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
        FS.forceLoadFile(node);
        const contents = stream.node.contents;
        return contents.copyInto(buffer, offset, length, position);
    };
    node.stream_ops = stream_ops;
    return node;
}
exports.createLazyFile = createLazyFile;


/***/ }),

/***/ "./src/sqlite.worker.ts":
/*!******************************!*\
  !*** ./src/sqlite.worker.ts ***!
  \******************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


/// <reference path="./types.d.ts" />
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.toObjects = void 0;
const Comlink = __importStar(__webpack_require__(/*! comlink */ "./node_modules/comlink/dist/esm/comlink.mjs"));
const sql_wasm_js_1 = __importDefault(__webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '../sql.js/dist/sql-wasm.js'"); e.code = 'MODULE_NOT_FOUND'; throw e; }())));
const sql_wasm_wasm_1 = __importDefault(__webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '../sql.js/dist/sql-wasm.wasm'"); e.code = 'MODULE_NOT_FOUND'; throw e; }())));
const lazyFile_1 = __webpack_require__(/*! ./lazyFile */ "./src/lazyFile.ts");
const vtab_1 = __webpack_require__(/*! ./vtab */ "./src/vtab.ts");
sql_wasm_wasm_1.default;
// https://gist.github.com/frankier/4bbc85f65ad3311ca5134fbc744db711
function initTransferHandlers(sql) {
    Comlink.transferHandlers.set("WORKERSQLPROXIES", {
        canHandle: (obj) => {
            let isDB = obj instanceof sql.Database;
            let hasDB = obj && obj.db && obj.db instanceof sql.Database; // prepared statements
            return isDB || hasDB;
        },
        serialize(obj) {
            const { port1, port2 } = new MessageChannel();
            Comlink.expose(obj, port1);
            return [port2, [port2]];
        },
        deserialize: (port) => { },
    });
}
async function init(wasmfile) {
    const sql = await (0, sql_wasm_js_1.default)({
        locateFile: (_file) => wasmfile,
    });
    initTransferHandlers(sql);
    return sql;
}
function toObjects(res) {
    return res.flatMap(r => r.values.map((v) => {
        const o = {};
        for (let i = 0; i < r.columns.length; i++) {
            o[r.columns[i]] = v[i];
        }
        return o;
    }));
}
exports.toObjects = toObjects;
async function fetchConfigs(configsOrUrls) {
    const configs = configsOrUrls.map(async (config) => {
        if (config.from === "jsonconfig") {
            const configUrl = new URL(config.configUrl, location.href);
            const req = await fetch(configUrl.toString());
            if (!req.ok) {
                console.error("httpvfs config error", await req.text());
                throw Error(`Could not load httpvfs config: ${req.status}: ${req.statusText}`);
            }
            const configOut = await req.json();
            return {
                from: "inline",
                // resolve url relative to config file
                config: configOut.serverMode === "chunked"
                    ? {
                        ...configOut,
                        urlPrefix: new URL(configOut.urlPrefix, configUrl).toString(),
                    }
                    : {
                        ...configOut,
                        url: new URL(configOut.url, configUrl).toString(),
                    },
                virtualFilename: config.virtualFilename,
            };
        }
        else {
            return config;
        }
    });
    return Promise.all(configs);
}
const mod = {
    db: null,
    inited: false,
    sqljs: null,
    bytesRead: 0,
    async SplitFileHttpDatabase(wasmUrl, configs, mainVirtualFilename, maxBytesToRead = Infinity) {
        if (this.inited)
            throw Error(`sorry, only one db is supported right now`);
        this.inited = true;
        if (!this.sqljs) {
            this.sqljs = init(wasmUrl);
        }
        const sql = await this.sqljs;
        this.bytesRead = 0;
        let requestLimiter = (bytes) => {
            if (this.bytesRead + bytes > maxBytesToRead) {
                this.bytesRead = 0;
                // I couldn't figure out how to get ERRNO_CODES included
                // so just hardcode the actual value
                // https://github.com/emscripten-core/emscripten/blob/565fb3651ed185078df1a13b8edbcb6b2192f29e/system/include/wasi/api.h#L146
                // https://github.com/emscripten-core/emscripten/blob/565fb3651ed185078df1a13b8edbcb6b2192f29e/system/lib/libc/musl/arch/emscripten/bits/errno.h#L13
                throw new sql.FS.ErrnoError(6 /* EAGAIN */);
            }
            this.bytesRead += bytes;
        };
        const lazyFiles = new Map();
        const hydratedConfigs = await fetchConfigs(configs);
        let mainFileConfig;
        for (const { config, virtualFilename } of hydratedConfigs) {
            const id = config.serverMode === "chunked" ? config.urlPrefix : config.url;
            console.log("constructing url database", id);
            let rangeMapper;
            let suffix = config.cacheBust ? "?cb=" + config.cacheBust : "";
            if (config.serverMode == "chunked") {
                rangeMapper = (from, to) => {
                    const serverChunkId = (from / config.serverChunkSize) | 0;
                    const serverFrom = from % config.serverChunkSize;
                    const serverTo = serverFrom + (to - from);
                    return {
                        url: config.urlPrefix + String(serverChunkId).padStart(config.suffixLength, "0") + suffix,
                        fromByte: serverFrom,
                        toByte: serverTo,
                    };
                };
            }
            else {
                rangeMapper = (fromByte, toByte) => ({
                    url: config.url + suffix,
                    fromByte,
                    toByte,
                });
            }
            const filename = virtualFilename || id.replace(/\//g, "_");
            if (!mainVirtualFilename) {
                mainVirtualFilename = filename;
                mainFileConfig = config;
            }
            console.log("filename", filename);
            console.log("constructing url database", id, "filename", filename);
            const lazyFile = (0, lazyFile_1.createLazyFile)(sql.FS, "/", filename, true, true, {
                rangeMapper,
                requestChunkSize: config.requestChunkSize,
                fileLength: config.serverMode === "chunked"
                    ? config.databaseLengthBytes
                    : undefined,
                logPageReads: true,
                maxReadHeads: 3,
                requestLimiter
            });
            lazyFiles.set(filename, lazyFile);
        }
        this.db = new sql.CustomDatabase(mainVirtualFilename);
        if (mainFileConfig) {
            // verify page size and disable cache (since we hold everything in memory anyways)
            const pageSizeResp = await this.db.exec("pragma page_size; pragma cache_size=0");
            const pageSize = pageSizeResp[0].values[0][0];
            if (pageSize !== mainFileConfig.requestChunkSize)
                console.warn(`Chunk size does not match page size: pragma page_size = ${pageSize} but chunkSize = ${mainFileConfig.requestChunkSize}`);
        }
        this.db.lazyFiles = lazyFiles;
        this.db.create_vtab(vtab_1.SeriesVtab);
        this.db.query = (...args) => toObjects(this.db.exec(...args));
        return this.db;
    },
    getResetAccessedPages(virtualFilename) {
        if (!this.db)
            return [];
        const lazyFile = this.db.lazyFiles.get(virtualFilename || this.db.filename);
        if (!lazyFile)
            throw Error("unknown lazy file");
        const pages = [...lazyFile.contents.readPages];
        lazyFile.contents.readPages = [];
        return pages;
    },
    getStats(virtualFilename) {
        const db = this.db;
        if (!db)
            return null;
        const lazyFile = db.lazyFiles.get(virtualFilename || db.filename);
        if (!lazyFile)
            throw Error("unknown lazy file");
        const res = {
            filename: db.filename,
            totalBytes: lazyFile.contents.length,
            totalFetchedBytes: lazyFile.contents.totalFetchedBytes,
            totalRequests: lazyFile.contents.totalRequests,
        };
        return res;
    },
    async evalCode(code) {
        return await eval(`(async function (db) {
      ${code}
    })`)(this.db);
    },
};
Comlink.expose(mod);


/***/ }),

/***/ "./src/vtab.ts":
/*!*********************!*\
  !*** ./src/vtab.ts ***!
  \*********************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SeriesVtab = void 0;
/*const seriesVfs: sqlite3_module = {
  iVersion: 0,
  xConnect()
}
*/
const SQLITE_OK = 0;
const SQLITE_MISUSE = 21;
var Columns;
(function (Columns) {
    Columns[Columns["idx"] = 0] = "idx";
    Columns[Columns["id"] = 1] = "id";
    Columns[Columns["tagName"] = 2] = "tagName";
    Columns[Columns["textContent"] = 3] = "textContent";
    Columns[Columns["innerHTML"] = 4] = "innerHTML";
    Columns[Columns["outerHTML"] = 5] = "outerHTML";
    Columns[Columns["className"] = 6] = "className";
    Columns[Columns["parent"] = 7] = "parent";
    Columns[Columns["selector"] = 8] = "selector";
    Columns[Columns["querySelector"] = 9] = "querySelector";
})(Columns || (Columns = {}));
const columnNames = Object.keys(Columns)
    .map((key) => Columns[key])
    .filter((value) => typeof value === "string");
function rowToObject(row) {
    const out = {};
    for (let i = 0; i < row.length; i++) {
        out[Columns[i]] = row[i];
    }
    return out;
}
// sends a request to the main thread via postMessage,
// then synchronously waits for the result via a SharedArrayBuffer
function doAsyncRequestToMainThread(request) {
    // todo: dynamically adjust this for response size
    const sab = new SharedArrayBuffer(1024 * 1024);
    // first element is for atomic synchronisation, second element is the length of the response
    const metaArray = new Int32Array(sab, 0, 2);
    metaArray[0] = 1;
    // send message to main thread
    self.postMessage({
        action: "eval",
        notify: sab,
        request,
    });
    Atomics.wait(metaArray, 0, 1); // wait until first element is not =1
    const dataLength = metaArray[1];
    // needs to be copied because textdecoder and encoder is not supported on sharedarraybuffers (for now)
    const dataArray = new Uint8Array(sab, 2 * 4, dataLength).slice();
    const resStr = new TextDecoder().decode(dataArray);
    const res = JSON.parse(resStr);
    if ("err" in res)
        throw new Error(res.err);
    return res.ok;
}
class SeriesVtab {
    constructor(module, db) {
        this.module = module;
        this.db = db;
        this.name = "dom";
        this.iVersion = 2;
        this.cursors = new Map();
        console.log("constructed vfs");
    }
    getCursor(cursor) {
        const cursorObj = this.cursors.get(cursor);
        if (!cursorObj)
            throw Error("impl error");
        return cursorObj;
    }
    xConnect(conn, pAux, argc, argv, ppVTab, pzErr) {
        console.log("xconnect!!");
        const rc = this.db.handleError(this.module.ccall("sqlite3_declare_vtab", "number", ["number", "string"], [
            conn,
            `create table x(
              ${columnNames.slice(0, -1).join(", ")} PRIMARY KEY
          ) WITHOUT ROWID`,
        ]));
        const out_ptr = this.module._malloc(12);
        this.module.setValue(ppVTab, out_ptr, "*");
        return SQLITE_OK;
    }
    xDisconnect(pVTab) {
        this.module._free(pVTab);
        return SQLITE_OK;
    }
    xOpen(pVTab, ppCursor) {
        const cursor = this.module._malloc(4);
        // this.module.setValue(series_cursor + 4, cursorId, "i32");
        this.cursors.set(cursor, { elements: [], index: 0, querySelector: "" });
        this.module.setValue(ppCursor, cursor, "*");
        return SQLITE_OK;
    }
    xClose(sqlite3_vtab_cursor) {
        this.module._free(sqlite3_vtab_cursor);
        return SQLITE_OK;
    }
    /*setErrorMessage(cursorPtr: Ptr<sqlite3_vtab_cursor>) {
      const vtabPointer: Ptr<sqlite3_vtab> = this.module.getValue(cursorPtr, "i32");
      const before = this.module.getValue(vtabPointer + 8, "i32");
      console.log("err before", before);
      this.module.setValue(vtabPointer + 8, intArrayFromString("FLONKITAL"), "i32");
    }*/
    xBestIndex(pVTab, info) {
        try {
            const nConstraint = this.module.getValue(info + 0, "i32");
            const aConstraint = this.module.getValue(info + 4, "i32");
            // const constraint = this.module.getValue(aConstraint, "i32");
            // don't care
            const SQLITE_INDEX_CONSTRAINT_MATCH = 64;
            let haveSelectorMatchConstraint = false;
            for (let i = 0; i < nConstraint; i++) {
                const sizeofconstraint = 12;
                const curConstraint = aConstraint + i * sizeofconstraint;
                const iColumn = this.module.getValue(curConstraint, "i32");
                const op = this.module.getValue(curConstraint + 4, "i8");
                const usable = this.module.getValue(curConstraint + 5, "i8");
                if (!usable)
                    continue;
                if (op === SQLITE_INDEX_CONSTRAINT_MATCH) {
                    if (iColumn === Columns.selector) {
                        // this is the one
                        haveSelectorMatchConstraint = true;
                        const aConstraintUsage = this.module.getValue(info + 4 * 4, "i32");
                        const sizeofconstraintusage = 8;
                        this.module.setValue(aConstraintUsage + i * sizeofconstraintusage, 1, "i32");
                    }
                    else {
                        throw Error(`The match operator can only be applied to the selector column!`);
                    }
                }
                console.log(`constraint ${i}: ${Columns[iColumn]} (op=${op})`);
            }
            if (!haveSelectorMatchConstraint) {
                throw Error("You must query the dom using `select ... from dom where selector MATCH <css-selector>`");
            }
            // const aConstraintUsage0 = this.module.getValue(aConstraintUsageArr, "i32");
            const usedColumnsFlag = this.module.getValue(info + 16 * 4, "i32");
            this.module.setValue(info + 5 * 4, usedColumnsFlag, "i32"); // just save the used columns instead of an index id
            return SQLITE_OK;
        }
        catch (e) {
            console.error("xbestindex", e);
            this.setVtabError(pVTab, String(e));
            return SQLITE_MISUSE;
        }
    }
    xFilter(cursorPtr, idxNum, idxStr, argc, argv) {
        console.log("xfilter", argc);
        if (argc !== 1) {
            console.error("did not get a single argument to xFilter");
            return SQLITE_MISUSE;
        }
        const querySelector = this.module.extract_value(argv + 0);
        const cursor = this.getCursor(cursorPtr);
        // await new Promise(e => setTimeout(e, 1000));
        cursor.querySelector = querySelector;
        const usedColumnsFlag = idxNum;
        const usedColumns = columnNames.filter((c) => usedColumnsFlag & (1 << Columns[c]));
        console.log("used columns", usedColumns);
        cursor.elements = doAsyncRequestToMainThread({
            type: "select",
            selector: querySelector,
            columns: usedColumns,
        }); // document.querySelectorAll(str);
        // don't filter anything
        return SQLITE_OK;
    }
    xNext(cursorPtr) {
        const cursor = this.getCursor(cursorPtr);
        cursor.index++;
        return SQLITE_OK;
    }
    xEof(cursorPtr) {
        const cursor = this.getCursor(cursorPtr);
        return +(cursor.index >= cursor.elements.length);
    }
    xColumn(cursorPtr, ctx, column) {
        const cursor = this.getCursor(cursorPtr);
        const ele = cursor.elements[cursor.index];
        if (Columns[column] in ele) {
            this.module.set_return_value(ctx, ele[Columns[column]]);
        }
        else {
            switch (column) {
                case Columns.idx: {
                    this.module.set_return_value(ctx, cursor.index);
                    break;
                }
                case Columns.querySelector: {
                    this.module.set_return_value(ctx, cursor.querySelector);
                    break;
                }
                default: {
                    throw Error(`unknown column ${Columns[column]}`);
                }
            }
        }
        return SQLITE_OK;
    }
    setVtabError(vtab, err) {
        const len = this.module.lengthBytesUTF8(err) + 1;
        const ptr = this.module.sqlite3_malloc(len);
        console.log("writing error", err, len);
        this.module.stringToUTF8(err, ptr, len);
        this.module.setValue(vtab + 8, ptr, "i32");
    }
    xUpdate(vtab, argc, argv, pRowid) {
        try {
            // https://www.sqlite.org/vtab.html#xupdate
            const [oldPrimaryKey, newPrimaryKey, ...args] = Array.from({ length: argc }, (_, i) => this.module.extract_value(argv + 4 * i));
            if (!oldPrimaryKey) {
                console.assert(newPrimaryKey === null);
                // INSERT
                doAsyncRequestToMainThread({
                    type: "insert",
                    value: rowToObject(args),
                });
            }
            else if (oldPrimaryKey && !newPrimaryKey) {
                console.log("DELETE", oldPrimaryKey);
                doAsyncRequestToMainThread({
                    type: "delete",
                    selector: oldPrimaryKey,
                });
                // DELETE
            }
            else {
                // UPDATE
                if (oldPrimaryKey !== newPrimaryKey) {
                    throw "The selector row can't be set";
                }
                doAsyncRequestToMainThread({
                    type: "update",
                    value: rowToObject(args),
                });
            }
            return SQLITE_OK;
        }
        catch (e) {
            this.setVtabError(vtab, String(e));
            return SQLITE_MISUSE;
        }
    }
    xRowid(sqlite3_vtab_cursor, pRowid) {
        throw Error("xRowid not implemented");
    }
    xFindFunction(pVtab, nArg, zName, pxFunc, ppArg) {
        const name = this.module.UTF8ToString(zName);
        if (name !== "match") {
            return SQLITE_OK;
        }
        const SQLITE_INDEX_CONSTRAINT_FUNCTION = 150;
        this.module.setValue(pxFunc, this.module.addFunction((ctx, argc, argv) => {
            // always return true since we apply this filter in the xFilter function
            this.module.set_return_value(ctx, true);
        }, "viii"), "i32");
        return SQLITE_INDEX_CONSTRAINT_FUNCTION;
    }
}
exports.SeriesVtab = SeriesVtab;


/***/ }),

/***/ "./node_modules/comlink/dist/esm/comlink.mjs":
/*!***************************************************!*\
  !*** ./node_modules/comlink/dist/esm/comlink.mjs ***!
  \***************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "createEndpoint": () => (/* binding */ createEndpoint),
/* harmony export */   "expose": () => (/* binding */ expose),
/* harmony export */   "proxy": () => (/* binding */ proxy),
/* harmony export */   "proxyMarker": () => (/* binding */ proxyMarker),
/* harmony export */   "releaseProxy": () => (/* binding */ releaseProxy),
/* harmony export */   "transfer": () => (/* binding */ transfer),
/* harmony export */   "transferHandlers": () => (/* binding */ transferHandlers),
/* harmony export */   "windowEndpoint": () => (/* binding */ windowEndpoint),
/* harmony export */   "wrap": () => (/* binding */ wrap)
/* harmony export */ });
/**
 * Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const proxyMarker = Symbol("Comlink.proxy");
const createEndpoint = Symbol("Comlink.endpoint");
const releaseProxy = Symbol("Comlink.releaseProxy");
const throwMarker = Symbol("Comlink.thrown");
const isObject = (val) => (typeof val === "object" && val !== null) || typeof val === "function";
/**
 * Internal transfer handle to handle objects marked to proxy.
 */
const proxyTransferHandler = {
    canHandle: (val) => isObject(val) && val[proxyMarker],
    serialize(obj) {
        const { port1, port2 } = new MessageChannel();
        expose(obj, port1);
        return [port2, [port2]];
    },
    deserialize(port) {
        port.start();
        return wrap(port);
    },
};
/**
 * Internal transfer handler to handle thrown exceptions.
 */
const throwTransferHandler = {
    canHandle: (value) => isObject(value) && throwMarker in value,
    serialize({ value }) {
        let serialized;
        if (value instanceof Error) {
            serialized = {
                isError: true,
                value: {
                    message: value.message,
                    name: value.name,
                    stack: value.stack,
                },
            };
        }
        else {
            serialized = { isError: false, value };
        }
        return [serialized, []];
    },
    deserialize(serialized) {
        if (serialized.isError) {
            throw Object.assign(new Error(serialized.value.message), serialized.value);
        }
        throw serialized.value;
    },
};
/**
 * Allows customizing the serialization of certain values.
 */
const transferHandlers = new Map([
    ["proxy", proxyTransferHandler],
    ["throw", throwTransferHandler],
]);
function expose(obj, ep = self) {
    ep.addEventListener("message", function callback(ev) {
        if (!ev || !ev.data) {
            return;
        }
        const { id, type, path } = Object.assign({ path: [] }, ev.data);
        const argumentList = (ev.data.argumentList || []).map(fromWireValue);
        let returnValue;
        try {
            const parent = path.slice(0, -1).reduce((obj, prop) => obj[prop], obj);
            const rawValue = path.reduce((obj, prop) => obj[prop], obj);
            switch (type) {
                case "GET" /* GET */:
                    {
                        returnValue = rawValue;
                    }
                    break;
                case "SET" /* SET */:
                    {
                        parent[path.slice(-1)[0]] = fromWireValue(ev.data.value);
                        returnValue = true;
                    }
                    break;
                case "APPLY" /* APPLY */:
                    {
                        returnValue = rawValue.apply(parent, argumentList);
                    }
                    break;
                case "CONSTRUCT" /* CONSTRUCT */:
                    {
                        const value = new rawValue(...argumentList);
                        returnValue = proxy(value);
                    }
                    break;
                case "ENDPOINT" /* ENDPOINT */:
                    {
                        const { port1, port2 } = new MessageChannel();
                        expose(obj, port2);
                        returnValue = transfer(port1, [port1]);
                    }
                    break;
                case "RELEASE" /* RELEASE */:
                    {
                        returnValue = undefined;
                    }
                    break;
                default:
                    return;
            }
        }
        catch (value) {
            returnValue = { value, [throwMarker]: 0 };
        }
        Promise.resolve(returnValue)
            .catch((value) => {
            return { value, [throwMarker]: 0 };
        })
            .then((returnValue) => {
            const [wireValue, transferables] = toWireValue(returnValue);
            ep.postMessage(Object.assign(Object.assign({}, wireValue), { id }), transferables);
            if (type === "RELEASE" /* RELEASE */) {
                // detach and deactive after sending release response above.
                ep.removeEventListener("message", callback);
                closeEndPoint(ep);
            }
        });
    });
    if (ep.start) {
        ep.start();
    }
}
function isMessagePort(endpoint) {
    return endpoint.constructor.name === "MessagePort";
}
function closeEndPoint(endpoint) {
    if (isMessagePort(endpoint))
        endpoint.close();
}
function wrap(ep, target) {
    return createProxy(ep, [], target);
}
function throwIfProxyReleased(isReleased) {
    if (isReleased) {
        throw new Error("Proxy has been released and is not useable");
    }
}
function createProxy(ep, path = [], target = function () { }) {
    let isProxyReleased = false;
    const proxy = new Proxy(target, {
        get(_target, prop) {
            throwIfProxyReleased(isProxyReleased);
            if (prop === releaseProxy) {
                return () => {
                    return requestResponseMessage(ep, {
                        type: "RELEASE" /* RELEASE */,
                        path: path.map((p) => p.toString()),
                    }).then(() => {
                        closeEndPoint(ep);
                        isProxyReleased = true;
                    });
                };
            }
            if (prop === "then") {
                if (path.length === 0) {
                    return { then: () => proxy };
                }
                const r = requestResponseMessage(ep, {
                    type: "GET" /* GET */,
                    path: path.map((p) => p.toString()),
                }).then(fromWireValue);
                return r.then.bind(r);
            }
            return createProxy(ep, [...path, prop]);
        },
        set(_target, prop, rawValue) {
            throwIfProxyReleased(isProxyReleased);
            // FIXME: ES6 Proxy Handler `set` methods are supposed to return a
            // boolean. To show good will, we return true asynchronously ¯\_(ツ)_/¯
            const [value, transferables] = toWireValue(rawValue);
            return requestResponseMessage(ep, {
                type: "SET" /* SET */,
                path: [...path, prop].map((p) => p.toString()),
                value,
            }, transferables).then(fromWireValue);
        },
        apply(_target, _thisArg, rawArgumentList) {
            throwIfProxyReleased(isProxyReleased);
            const last = path[path.length - 1];
            if (last === createEndpoint) {
                return requestResponseMessage(ep, {
                    type: "ENDPOINT" /* ENDPOINT */,
                }).then(fromWireValue);
            }
            // We just pretend that `bind()` didn’t happen.
            if (last === "bind") {
                return createProxy(ep, path.slice(0, -1));
            }
            const [argumentList, transferables] = processArguments(rawArgumentList);
            return requestResponseMessage(ep, {
                type: "APPLY" /* APPLY */,
                path: path.map((p) => p.toString()),
                argumentList,
            }, transferables).then(fromWireValue);
        },
        construct(_target, rawArgumentList) {
            throwIfProxyReleased(isProxyReleased);
            const [argumentList, transferables] = processArguments(rawArgumentList);
            return requestResponseMessage(ep, {
                type: "CONSTRUCT" /* CONSTRUCT */,
                path: path.map((p) => p.toString()),
                argumentList,
            }, transferables).then(fromWireValue);
        },
    });
    return proxy;
}
function myFlat(arr) {
    return Array.prototype.concat.apply([], arr);
}
function processArguments(argumentList) {
    const processed = argumentList.map(toWireValue);
    return [processed.map((v) => v[0]), myFlat(processed.map((v) => v[1]))];
}
const transferCache = new WeakMap();
function transfer(obj, transfers) {
    transferCache.set(obj, transfers);
    return obj;
}
function proxy(obj) {
    return Object.assign(obj, { [proxyMarker]: true });
}
function windowEndpoint(w, context = self, targetOrigin = "*") {
    return {
        postMessage: (msg, transferables) => w.postMessage(msg, targetOrigin, transferables),
        addEventListener: context.addEventListener.bind(context),
        removeEventListener: context.removeEventListener.bind(context),
    };
}
function toWireValue(value) {
    for (const [name, handler] of transferHandlers) {
        if (handler.canHandle(value)) {
            const [serializedValue, transferables] = handler.serialize(value);
            return [
                {
                    type: "HANDLER" /* HANDLER */,
                    name,
                    value: serializedValue,
                },
                transferables,
            ];
        }
    }
    return [
        {
            type: "RAW" /* RAW */,
            value,
        },
        transferCache.get(value) || [],
    ];
}
function fromWireValue(value) {
    switch (value.type) {
        case "HANDLER" /* HANDLER */:
            return transferHandlers.get(value.name).deserialize(value.value);
        case "RAW" /* RAW */:
            return value.value;
    }
}
function requestResponseMessage(ep, msg, transfers) {
    return new Promise((resolve) => {
        const id = generateUUID();
        ep.addEventListener("message", function l(ev) {
            if (!ev.data || !ev.data.id || ev.data.id !== id) {
                return;
            }
            ep.removeEventListener("message", l);
            resolve(ev.data);
        });
        if (ep.start) {
            ep.start();
        }
        ep.postMessage(Object.assign({ id }, msg), transfers);
    });
}
function generateUUID() {
    return new Array(4)
        .fill(0)
        .map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16))
        .join("-");
}


//# sourceMappingURL=comlink.mjs.map


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./src/sqlite.worker.ts");
/******/ 	
/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=sqlite.worker.js.map