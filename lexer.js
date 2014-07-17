"use strict";

var DEBUG = true,
    assert;

if (DEBUG) assert = require('assert');

function debug() {
    if (DEBUG) console.error.apply(this, arguments);
}

function strMul(str, i) {
    return Array(i+1).join(str);
};

function Token(type, content, depth) {
    this.type = type;
    this.content = content;
    this.depth = depth;

    debug('TOKEN:', this);
}

("BEGIN END DIRECTIVE " +
 "TEXT BLANK PARA " +
 "UL_LI UL_BEGIN UL_END " + 
 "OL_LI OL_BEGIN OL_END " +
 "BQ_LI BQ_BEGIN BQ_END " +
 "SECTION").split(" ").forEach(function(t, i) {
    Object.defineProperty(Token, t, { value: i });
});

exports.Token = Token;

function Lexer() {
    this._buf = [];
    this._lastToken = Token.BEGIN;
    this._depthStack = [];
    this._bqDepth = 0;
}
exports.Lexer = Lexer;

Lexer.prototype = {
    lex: function(data) {
        var i, ii,
            out = [];

        this._lastToken = Token.BEGIN;
        this._depthStack = [];
        this._bqDepth = 0;

        for (i = 0, ii = data.length; i <= ii; ++i) {
            this.lexLine(data[i], out);
        }

        return out;
    },

    lexLine: function(line, out) {
        var lineData = this._detectToken(line);
        debug('LEX:', lineData);
        
        if (lineData.token == Token.BQ_LI) {
            while (lineData.depth > this._bqDepth) {
                if (this._buf.length > 0 && this._lastToken == Token.TEXT) {
                    out.push(new Token(Token.PARA, this._buf.join(" ")));
                    this._buf = [];
                }
            
                out.push(new Token(Token.BQ_BEGIN));
                this._bqDepth++;
            }

            while (lineData.depth < this._bqDepth) {
                if (this._buf.length > 0 && this._lastToken == Token.TEXT) {
                    out.push(new Token(Token.PARA, this._buf.join(" ")));
                    this._buf = [];
                }
                
                out.push(new Token(Token.BQ_END));
                this._bqDepth--;
            }
            
            lineData = this._detectToken(lineData.content);
        }

        switch (lineData.token) {
            case Token.END:
            case Token.BLANK:
                if (this._buf.length > 0 && this._lastToken == Token.TEXT) {
                    out.push(new Token(Token.PARA, this._buf.join(" ")));
                }

                if (this._lastToken == Token.UL_LI || 
                    this._lastToken == Token.OL_LI) {
                    
                    out.push(new Token(this._lastToken, this._buf.join(" ")));
                    
                    while (this._depthStack.length > 0) {
                        out.push(this._depthStack.pop());
                    }
                }
                
                while (Token.END == lineData.token && this._bqDepth > 0) {
                    out.push(new Token(Token.BQ_END));
                    this._bqDepth--;
                }

                this._buf = [];
                if (DEBUG) {
                    assert(this._depthStack.length == 0);
                    assert(Token.END != lineData.token || this._bqDepth == 0);
                }
                break;
            
            case Token.SECTION:
                out.push(new Token(Token.SECTION, lineData.content, lineData.depth));
                break;
            
            case Token.OL_LI:
                if (lineData.token == this._lastToken ||
                    this._lastToken == Token.UL_LI ||
                    this._lastToken == Token.BLANK) {
                    
                    if (lineData.depth != this._depthStack.length-1) {
                        if (this._lastToken == lineData.token ||
                            this._lastToken == Token.UL_LI) {
                            out.push(new Token(Token.OL_LI, this._buf.join(" ")));
                            this._buf = [];
                        }
                        out.push(new Token(
                            lineData.depth > this._depthStack.length-1 ? Token.OL_BEGIN : Token.OL_END));
                        this._depthStack.push(new Token(Token.OL_END));
                        //lastDepth = lineData.depth;
                    } else {
                        out.push(new Token(Token.OL_LI, this._buf.join(" ")));
                        this._buf = [];
                    }

                }

                this._buf.push(lineData.content);
                break;

            case Token.UL_LI:
                if (lineData.token == this._lastToken ||
                    this._lastToken == Token.OL_LI ||
                    this._lastToken == Token.BLANK) {
                    
                    if (lineData.depth != this._depthStack.length-1) {
                        if (this._lastToken == lineData.token ||
                            this._lastToken == Token.OL_LI) {
                            out.push(new Token(Token.UL_LI, this._buf.join(" ")));
                            this._buf = [];
                        }
                        out.push(new Token(
                            lineData.depth > this._depthStack.length-1 ? Token.UL_BEGIN : Token.UL_END));
                        
                        this._depthStack.push(new Token(Token.UL_END));
                        //lastDepth = lineData.depth;
                    } else {
                        out.push(new Token(Token.UL_LI, this._buf.join(" ")));
                        this._buf = [];
                    }
                }

                this._buf.push(lineData.content);
                break;

            case Token.TEXT:
                this._buf.push(lineData.content);
                break;

            default:
                throw new Error('ivnalid token');
                break;
        }

        this._lastToken = lineData.token;
    },

    _detectToken: function(line) {
        var depth,
            raw,
            lastToken = this._lastToken,
            lastDepth = this._depthStack.length - 1;

        debug('DETECT:', line, lastToken, lastDepth);
        
        // Blank
        if (/^(\t|\s)*$/.test(line)) {
            return { token: Token.BLANK };
        }
        
        // Sections
        if (/^#+/.test(line)) {
            if (lastToken != Token.BLANK &&
                lastToken != Token.BEGIN) {
                throw new Error("There's a section without a new line before it, it seems.");
            }

            depth = /^(#+)/.exec(line)[1].length;
            return { token: Token.SECTION,
                     content: line.substring(depth).trim(),
                     depth: depth };
        }
        
        // Ordered lists
        // TODO: make this variable for the various number types
        if (/^\s*\d+\. /.test(line)) {
            raw = /^(\s*)\d+\. (.*)/.exec(line);
            
            if (raw[1].length % 2 != 0) {
                throw new Error("List items must be indented by two spaces for each depth.");
            }
            
            depth = raw[1].length / 2;
            
            if (lastToken != Token.OL_LI &&
                lastToken != Token.BLANK &&
                lastToken != Token.TEXT) {
                throw new Error("There's a list without a new line before it, it seems.");
            }
            
            if ((lastToken != Token.OL_LI && lastToken != Token.BLANK && lastToken != Token.TEXT) &&
                !(lastToken == Token.UL_LI && lastDepth <= depth)) {
                throw new Error("There's a list without a new line before it, it seems.");
            }

            if (lastToken == Token.UL_LI && 
                lastDepth == depth) {
                throw new Error ("You cannot place an ordered list item in an unordered list.");
            }

            return { token: Token.OL_LI,
                     content: raw[2],
                     depth: depth };
        }

        // Unordered lists
        if (/^\s*\*\s/.test(line)) {
            raw = /^(\s*)\* (.*)/.exec(line);
            
            if (raw[1].length % 2 != 0) {
                throw new Error("List items must be indented by two spaces for each depth.");
            }
            
            depth = raw[1].length / 2;
            
            if ((lastToken != Token.UL_LI && lastToken != Token.BLANK && lastToken != Token.TEXT) &&
                !(lastToken == Token.OL_LI && lastDepth <= depth)) {
                throw new Error("There's a list without a new line before it, it seems.");
            }

            if (lastToken == Token.OL_LI && 
                lastDepth == depth) {
                throw new Error ("You cannot place an unordered list item in an ordered list.");
            }

            return { token: Token.UL_LI,
                     content: raw[2],
                     depth: depth };
        }

        // Blockquotes
        if (/^>+/.test(line)) {
            raw = /^(>+)(.*)/.exec(line);

            return { token: Token.BQ_LI,
                     content: raw[2].trim(),
                     depth: raw[1].length };
        }

        if (line == null) {
            return { token: Token.END };
        }

        return { token: Token.TEXT, content: line.trim() };
    }
}

