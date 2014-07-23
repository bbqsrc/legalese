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

function last(ary) {
    return ary[ary.length-1];
}

function Token(type, content, depth) {
    this.type = type;
    this.content = content || [];
    this.depth = depth;
}

("BEGIN END DIRECTIVE " +
 "TEXT BLANK PARA " +
 "UL_LI UL_BEGIN UL_END " + 
 "OL_LI OL_BEGIN OL_END " +
 "BQ_LI BQ_BEGIN BQ_END " +
 "SECTION REF LINK " +
 "BOLD ITALIC UNDERLINE " +
 "SUP SUB STRIKETHROUGH " +
 "SERIF SANS MONOSPACED").split(" ").forEach(function(t, i) {
    Object.defineProperty(Token, t, { value: i, enumerable: true});
});


debug(require('util').inspect(Token));
// TODO: implement ref, link, bold, italic, underline, sup, sub,
// strikethrough, serif, sans, monospaced

exports.Token = Token;

function Lexer() {
    this._buf = [];
    this._lastToken = Token.BEGIN;
    this._depthStack = [];
    this._bqDepth = 0;

    /*
    this._numbering = {};

    this._numberingFallback = {
        h: /^(#+) (\d*) (.*)/, // size, number, content
        ol: / /,
    };
    */
}
exports.Lexer = Lexer;

Lexer.prototype = {
    /*
    _getNumberingRegex: function(token, level) {
        if (this._numberingFallback[token] == null) {
            throw new Error("Invalid token for numbering regex");
        }
        
        var t = this._numbering[token],
            l;

        if (t == null) {
            return this._numberingFallback[token];
        }

        l = t[level];

        if (l == null) {
            return this._numberingFallback[token];
        }
       
        return l;
    },*/
    _numberStyles: {
        "decimal": {
            regex: '\\d+',
            parse: function(v) { return parseInt(v, 10); }
        },
        "lower-alpha": {
            regex: "[a-z]+",
            parse: function(v) {
                return v;
            },
        },
        "upper-roman": {
            regex: "(?:M{0,4})(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})",
            parse: function(v) {
                var result = 0,
                    index = 0,
                    romanNumeralMap = {
                       'M':  1000,
                       'CM': 900,
                       'D':  500,
                       'CD': 400,
                       'C':  100,
                       'XC': 90,
                       'L':  50,
                       'XL': 40,
                       'X':  10,
                       'IX': 9,
                       'V':  5,
                       'IV': 4,
                       'I':  1
                    };

                Object.keys(romanNumeralMap).forEach(function(k) {
                    var i = romanNumeralMap[k];

                    while (v.slice(index, index + k.length) == k) {
                        result += i;
                        index += k.length;
                    }
                });
                
                return result;
            }
        },
        "lower-roman": {
            regex: "(?:m{0,4})(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})",
            parse: function(v) {
                var result = 0,
                    index = 0,
                    romanNumeralMap = {
                       'm':  1000,
                       'cm': 900,
                       'd':  500,
                       'cd': 400,
                       'c':  100,
                       'xc': 90,
                       'l':  50,
                       'xl': 40,
                       'x':  10,
                       'ix': 9,
                       'v':  5,
                       'iv': 4,
                       'i':  1
                    };

                Object.keys(romanNumeralMap).forEach(function(k) {
                    var i = romanNumeralMap[k];

                    while (v.slice(index, index + k.length) == k) {
                        result += i;
                        index += k.length;
                    }
                });
                
                return result;
            }
        }
    },

    _tokenRegex: {
        ol: ["\\d+\\."],
        h: []
    },

    _parseTokenRegex: function(tokenData) {
        var self = this;

        return tokenData.replace(/^\/(.*)\/$/, "$1").replace(/`([^`]+)`/g, function(_, t) {
            if (!self._numberStyles[t]) {
                throw new Error("Unknown regex token '" + t + "'");
            }
            return self._numberStyles[t].regex;
        });
    },

    lex: function(data) {
        var i, ii;
        
        this._tokens = [];

        this._lastToken = Token.BEGIN;
        this._cur = null;
        this._depthStack = [];
        this._bqDepth = 0;
        this._bufTarget;

        for (i = 0, ii = data.length; i <= ii; ++i) {
            this.lexLine(data[i], this._tokens);
        }

        return this._tokens;
    },

    get _depth() { return this._depthStack.length - 1; },

    lexLine: function(line, out) {
        var lineData = this._detectToken(line);
        debug('LEX:', lineData);

        switch (lineData.token) {
            case Token.DIRECTIVE:
                delete lineData.token; // This never happened. >_> <_<
                out.push(new Token(Token.DIRECTIVE, lineData));
                break;

            case Token.END:
            case Token.BLANK:
                this._processCurrent();
                this._processListDepth(-1);
                break;
            
            case Token.SECTION:
                this._cur = new Token(Token.SECTION, null, lineData.depth);
                this._buf.push(lineData.content);
                break;

            case Token.OL_LI:
            case Token.UL_LI:
                this._processCurrent();
                this._processListDepth(lineData.depth, lineData.token);
                
                this._cur = new Token(lineData.token);
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

    _processListDepth: function(depth, type) {
        var beginToken, endToken;

        if (depth > this._depth) {
            if (depth > this._depth + 1) {
                throw new Error("You can't go up more than one level in one fell swoop!");
            }

            if (type != Token.UL_LI && type != Token.OL_LI) {
                throw new Error("You can't go up one level without a type!");
            }

            if (type == Token.UL_LI) {
                beginToken = Token.UL_BEGIN;
                endToken = Token.UL_END;
            } else {
                beginToken = Token.OL_BEGIN;
                endToken = Token.OL_END;
            }
            this._tokens.push(new Token(beginToken));
            this._depthStack.push(new Token(endToken));
        }

        while (depth < this._depth) {
            this._tokens.push(this._depthStack.pop());
        }
    },

    _processCurrent: function() {
        if (this._cur == null) {
            if (this._buf.length == 0) {
                return;
            }

            this._cur = new Token(Token.PARA);
        }
        
        this._cur.content = this._consumeBuffer();
        this._tokens.push(this._cur);
        debug('TOKEN:', this._cur);
        
        this._cur = null;
    },

    _consumeBuffer: function(dontEmpty) {
        var o = this._lexContent(this._buf.join(" "));
        if (!dontEmpty) this._buf = [];
        return o;
    },

    _lexContent: function(line) {
        var chars = line.split(""),
            token,
            tokens = [],
            buf = [],
            states = {},
            ch, i, ii;

        for (i = 0, ii = chars.length; i < ii; ++i) {
            ch = chars[i];

            switch(ch) {
                case '*':
                    states.bold = !states.bold;
                    tokens.push(new Token(states.bold ? Token.TEXT : Token.BOLD, buf.join("")));
                    buf = [];
                    break;
                /*
                case '/':
                    states.italic = !states.italic;
                    if (states.italic) { // Begin
                        tokens.push(new Token(Token.TEXT, buf.join("")));
                    } else { // End
                        tokens.push(new Token(Token.ITALIC, buf.join("")));
                    }
                    buf = [];
                    break;
                case '_':
                    states.underline = !states.underline;
                    if (states.underline) { // Begin
                        tokens.push(new Token(Token.TEXT, buf.join("")));
                    } else { // End
                        tokens.push(new Token(Token.UNDERLINE, buf.join("")));
                    }
                    buf = [];
                    break;*/
                default:
                    buf.push(ch);
                    break;
                
            }
        }

        if (buf.length > 0) {
            tokens.push(new Token(Token.TEXT, buf.join("")));
        }

        if (states.bold || states.italic || states.underline) {
            throw new Error("Unclosed tag on line foo");
        }

        return tokens;
    },

    _getTokenRegex: function(token) {
        var r;
        
        switch (token) {
            case "ol":
                r = new RegExp("^  (\\s*)(" + this._tokenRegex[token].join("|") + ")(.*)");
                break;
            case "h":
                r = new RegExp("^(#+)\\s*(" + this._tokenRegex[token].join("|") + "|)(.*)");
                break;
        }

        debug("TOKEN-REGEX:", r);
        return r;
    },

    _detectToken: function(line) {
        var depth,
            rules,
            raw,
            lastToken = this._lastToken,
            lastDepth = this._depthStack.length - 1;

        debug('DETECT:', line, lastToken, lastDepth);
        
        // Blank
        if (/^\s*$/.test(line)) {
            return { token: Token.BLANK };
        }
        
        // Sections
        if (this._getTokenRegex('h').test(line)) {
            if (lastToken != Token.BLANK &&
                lastToken != Token.BEGIN) {
                throw new Error("There's a section without a new line before it, it seems.");
            }

            raw = this._getTokenRegex('h').exec(line);
           
            console.log("FOO:",raw);

            return { token: Token.SECTION,
                     content: raw[3].trim(),
                     depth: raw[1].length };
        }
        
        // Ordered lists
        // TODO: make this variable for the various number types
        //if (/^\s*\d+\. /.test(line)) {
        //    raw = /^(\s*)\d+\. (.*)/.exec(line);
            
        if (this._getTokenRegex('ol').test(line)) {
            raw = this._getTokenRegex('ol').exec(line);
            
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
                     content: raw[3].trim(),
                     depth: depth };
        }

        // Unordered lists
        if (/^  \s*\*\s/.test(line)) {
            raw = /^  (\s*)\* (.*)/.exec(line);
            
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
                     content: raw[2].trim(),
                     depth: depth };
        }

        // Blockquotes
        if (/^>+/.test(line)) {
            raw = /^(>+)(.*)/.exec(line);

            return { token: Token.BQ_LI,
                     content: raw[2].trim(),
                     depth: raw[1].length };
        }

        // Directive
        if (/^!\s([^:]*)(?::([^(]*)(?:\((.*)\))?)?\s*{([\s\S]*)}/.test(line)) {
            return this._processDirective(line);
        }
        
        if (line == null) {
            return { token: Token.END };
        }

        return { token: Token.TEXT, content: line.trim() };
    },

    _processDirective: function(line) {
        var raw = /^!\s([^:]*)(?::([^(]*)(?:\((.*)\))?)?\s*{([\s\S]*)}/.exec(line),
            selector = raw[1],
            pseudoName = raw[2],
            pseudoArgs = raw[3].trim().split(',').map(function(a) { return a.trim(); }),
            rulesList = raw[4].trim().split(';').map(function(r) {
                var v = /([^:]+):(.*)/.exec(r);
                return {
                    key: v[1].trim(),
                    value: v[2].trim()
                };
            }),
            rules = Object.create(null),
            regex,
            o;

        rulesList.forEach(function(o) {
            rules[o.key] = o.value;
        });

        o = {
            token: Token.DIRECTIVE,
            selector: {
                name: selector,
                pseudo: {
                    name: pseudoName,
                    args: pseudoArgs
                }
            },
            rules: rules
        };

        if (o.rules.token) {
            regex = this._parseTokenRegex(o.rules.token);
            o.rules.token = regex;
            this._tokenRegex[selector].push(regex);
        }

        return o;
    }
}

