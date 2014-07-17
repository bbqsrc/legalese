"use strict";

var cheerio = require('cheerio');

var TOKEN_BEGIN = 0,
    TOKEN_END = 1,
    TOKEN_DIRECTIVE = 2,
    TOKEN_TEXT = 3,

    TOKEN_BLANK = 10,
    TOKEN_PARA = 11,
    TOKEN_UL_LI = 12,
    TOKEN_UL_BEGIN = 13,
    TOKEN_UL_END = 14,
    TOKEN_OL_LI = 15,
    TOKEN_OL_BEGIN = 16,
    TOKEN_OL_END = 17,

    TOKEN_SECTION = 20;

function Token(type, content, depth) {
    this.type = type;
    this.content = content;
    this.depth = depth;

    console.log('TOKEN:', this);
}

function Lexer() {
    this._buf = [];
}

function strMul(str, i) {
    return Array(i+1).join(str);
};

Lexer.prototype = {
    lex: function(data) {
        var i, ii, line, 
            lineData, 
            lastToken = TOKEN_BEGIN,
            depthStack = [],
            out = [];

        for (i = 0, ii = data.length; i <= ii; ++i) {
            if (i != ii) { 
                line = data[i];
                lineData = this.detectToken(line, lastToken, depthStack.length-1);
            } else {
                lineData = { token: TOKEN_END };
            }
            
            console.log('LEX:', lineData);
            
            switch (lineData.token) {
                case TOKEN_SECTION:
                    out.push(new Token(TOKEN_SECTION, lineData.content, lineData.depth));
                    break;
                
                case TOKEN_END:
                case TOKEN_BLANK:
                    if (this._buf.length > 0 && lastToken == TOKEN_TEXT) {
                        out.push(new Token(TOKEN_PARA, this._buf.join(" ")));
                    }

                    if (lastToken == TOKEN_UL_LI || 
                        lastToken == TOKEN_OL_LI) {
                        
                        out.push(new Token(lastToken, this._buf.join(" ")));
                        
                        while (depthStack.length > 0) {
                            out.push(depthStack.pop());
                        }
                    }
                    
                    this._buf = [];
                    assert(depthStack.length == 0)
                    break;
                
                case TOKEN_OL_LI:
                    if (lineData.token == lastToken ||
                        lastToken == TOKEN_UL_LI ||
                        lastToken == TOKEN_BLANK) {
                        
                        if (lineData.depth != depthStack.length-1) {
                            if (lastToken == lineData.token ||
                                lastToken == TOKEN_UL_LI) {
                                out.push(new Token(TOKEN_OL_LI, this._buf.join(" ")));
                                this._buf = [];
                            }
                            out.push(new Token(
                                lineData.depth > depthStack.length-1 ? TOKEN_OL_BEGIN : TOKEN_OL_END));
                            depthStack.push(new Token(TOKEN_OL_END));
                            //lastDepth = lineData.depth;
                        } else {
                            out.push(new Token(TOKEN_OL_LI, this._buf.join(" ")));
                            this._buf = [];
                        }

                    }

                    this._buf.push(lineData.content);
                    break;

                case TOKEN_UL_LI:
                    if (lineData.token == lastToken ||
                        lastToken == TOKEN_OL_LI ||
                        lastToken == TOKEN_BLANK) {
                        
                        if (lineData.depth != depthStack.length-1) {
                            if (lastToken == lineData.token ||
                                lastToken == TOKEN_OL_LI) {
                                out.push(new Token(TOKEN_UL_LI, this._buf.join(" ")));
                                this._buf = [];
                            }
                            out.push(new Token(
                                lineData.depth > depthStack.length-1 ? TOKEN_UL_BEGIN : TOKEN_UL_END));
                            
                            depthStack.push(new Token(TOKEN_UL_END));
                            //lastDepth = lineData.depth;
                        } else {
                            out.push(new Token(TOKEN_UL_LI, this._buf.join(" ")));
                            this._buf = [];
                        }
                    }

                    this._buf.push(lineData.content);
                    break;

                case TOKEN_TEXT:
                    this._buf.push(lineData.content);
                    break;

                default:
                    throw new Error('ivnalid token');
                    break;
            }

            lastToken = lineData.token;
        }

        return out;
    },

    detectToken: function(line, lastToken, lastDepth) {
        var depth,
            raw;

        // Blank
        if (/^(\t|\s)*$/.test(line)) {
            return { token: TOKEN_BLANK };
        }
        
        // Sections
        if (/^#+/.test(line)) {
            if (lastToken != TOKEN_BLANK &&
                lastToken != TOKEN_BEGIN) {
                throw new Error("There's a section without a new line before it, it seems.");
            }

            depth = /^(#+)/.exec(line)[1].length;
            return { token: TOKEN_SECTION,
                     content: line.substring(depth).trim(),
                     depth: depth };
        
        }
        
        // Ordered lists
        // TODO: make this variable for the various number types
        if (/^\s*\d+\. /.test(line)) {
            if (lastToken != TOKEN_OL_LI &&
                lastToken != TOKEN_BLANK &&
                lastToken != TOKEN_TEXT) {
                throw new Error("There's a list without a new line before it, it seems.");
            }

            raw = /^(\s*)\d+\. (.*)/.exec(line);

            if (raw[1].length % 2 != 0) {
                throw new Error("List items must be indented by two spaces for each depth.");
            }
            
            if (lastToken == TOKEN_UL_LI && 
                 lastDepth == raw[1].length / 2) {
                throw new Error ("You cannot place an ordered list item in an unordered list.");
            }

            return { token: TOKEN_OL_LI,
                     content: raw[2],
                     depth: raw[1].length / 2 };
        }

        // Unordered lists
        if (/^\s*\*\s/.test(line)) {
            raw = /^(\s*)\* (.*)/.exec(line)
            
            if (raw[1].length % 2 != 0) {
                throw new Error("List items must be indented by two spaces for each depth.");
            }
            
            depth = raw[1].length / 2;
            
            if ((lastToken != TOKEN_UL_LI && lastToken != TOKEN_BLANK && lastToken != TOKEN_TEXT) &&
                !(lastToken == TOKEN_OL_LI && lastDepth <= depth)) {
                throw new Error("There's a list without a new line before it, it seems.");
            }

            if (lastToken == TOKEN_OL_LI && 
                 lastDepth == depth) {
                throw new Error ("You cannot place an unordered list item in an ordered list.");
            }

            return { token: TOKEN_UL_LI,
                     content: raw[2],
                     depth: depth };
        }

        return { token: TOKEN_TEXT, content: line.trim() };
    }
}

function Parser() {};

Parser.prototype = {
    parse: function(data) {
        var out = [],
            depth = -1;

        var lexer = new Lexer(data);
        data = lexer.lex(data);
        
        data.forEach(function(x) {
            switch (x.type) {
                case TOKEN_SECTION:
                    out.push('\n' + strMul('#', x.depth) + " " + x.content);
                    break;
                case TOKEN_PARA:
                    out.push('\n' + x.content);
                    break;
                case TOKEN_UL_BEGIN:
                    if (depth == -1) {
                        out.push(''); // Force new line.
                    }
                    depth++;
                    break;
                case TOKEN_UL_END:
                    depth--;
                    break;
                case TOKEN_UL_LI:
                    out.push(strMul(' ', depth * 2) + "* " + x.content);
                    break;
                default:
                    throw new Error("Invalid token");
            }

            assert(depth >= -1);
        });

        return out.join("\n").trim();
    }
}

function HTMLParser() {};

HTMLParser.prototype = {
    parse: function(data) {
        var out = [],
            depth = -1,
            sectionDepth = 0,
            lastToken;

        var lexer = new Lexer(data);
        data = lexer.lex(data);
        
        data.forEach(function(x) {
            switch (x.type) {
                case TOKEN_SECTION:
                    while (sectionDepth < x.depth) {
                        out.push("<div class='section'>");
                        sectionDepth++;
                    }
                    
                    while (sectionDepth > x.depth) {
                        out.push("</div>");
                        sectionDepth--;
                    }

                    out.push("<h" + sectionDepth + ">" +
                             x.content +
                             "</h" + sectionDepth + ">");
                    
                    break;

                case TOKEN_PARA:
                    out.push('<p>' + x.content + "</p>");
                    break;

                case TOKEN_UL_BEGIN:
                    out.push('<ul>');
                    depth++;
                    break;
                
                case TOKEN_UL_END:
                    if (lastToken == TOKEN_UL_LI) {
                        out[out.length-1] += "</li>";
                    }
                    
                    if (lastToken == TOKEN_UL_END) {
                        out.push("</li>");
                    }

                    out.push('</ul>');
                    depth--;
                    break;
                
                case TOKEN_OL_BEGIN:
                    out.push('<ol>');
                    depth++;
                    break;
                
                case TOKEN_OL_END:
                    if (lastToken == TOKEN_OL_LI) {
                        out[out.length-1] += "</li>";
                    }
                    
                    if (lastToken == TOKEN_OL_END) {
                        out.push("</li>");
                    }

                    out.push('</ol>');
                    depth--;
                    break;

                case TOKEN_OL_LI:
                case TOKEN_UL_LI:
                    if (lastToken == TOKEN_UL_LI ||
                        lastToken == TOKEN_OL_LI) {
                        out[out.length-1] += "</li>";
                    }
                    
                    out.push("<li>" + x.content);
                    break;

                default:
                    throw new Error("Invalid token");
            }

            lastToken = x.type;

            assert(depth >= -1);
            assert(sectionDepth >= 0);
        });
        
        while (sectionDepth > 0) {
            out.push("</div>");
            sectionDepth--;
        }

        return out.join('\n');
    }
}

function test() {
    return new Lexer().lex(testText.split('\n'));
}

function test2() {
    console.log(new HTMLParser().parse(testText.split('\n')));
}
var testText = "# First Title\n" +
    "\n" +
    "Sudden paragraph of great desire. Oh my desire oh my.\n" + 
    "\n" +
    "* Dot point\n" +
    "* Dot point 2\n" +
    "  * Dot point 2.1\n" +
    "  * Dot point 2.2\n" +
    "\n" +
    "* Next list occurs\n" +
    "\n" +
    "## Second level title, woot\n\n" +
    "* No previous spacing, what happens?\n" +
    "\n" +
    "1. Ordered list!\n2. Another item!\n" +
    "  1. Another one.\n" +
    "  2. Another another.\n" +
    "    * Depth of steel?\n";
