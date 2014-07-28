"use strict";

var Lexer = require('./lexer').Lexer,
    Token = require('./lexer').Token,
    fs = require('fs'),
    util = require('util'),
    assert = require('assert');

function LaTeXParser() {};

LaTeXParser.prototype = {
    parse: function(data) {
        var self = this,
            out = [];

        var lexer = new Lexer(data);
        data = lexer.lex(data);
        
        data.forEach(function(x) {
            switch (x.type) {
                case Token.SECTION:
                    switch (x.depth) {
                        case 1:
                            out.push("\\part{" + self._handleContent(x.content) + "}\n");
                            break;
                        case 2:
                            out.push("\\section{" + self._handleContent(x.content) + "}\n");
                            break;
                        case 3:
                            out.push("\\subsection{" + self._handleContent(x.content) + "}\n");
                            break;
                    }
                    break;

                case Token.PARA:
                    out.push(self._handleContent(x.content) + "\n");
                    break;

                case Token.BQ_BEGIN:
                    break;

                case Token.BQ_END:
                    break;

                case Token.UL_BEGIN:
                    out.push('\\begin{itemize}');
                    break;
                
                case Token.UL_END:
                    out.push('\\end{itemize}\n');
                    break;
                
                case Token.OL_BEGIN:
                    out.push('\\begin{enumerate}');
                    break;
                
                case Token.OL_END:
                    out.push('\\end{enumerate}\n');
                    break;

                case Token.OL_LI:
                case Token.UL_LI:
                    out.push("\\item " + self._handleContent(x.content));
                    break;

                case Token.DIRECTIVE:
                    break;
                
                default:
                    throw new Error("Invalid token: " + util.inspect(x));
            }
        });

        return out.join('\n');
    },

    _handleContent: function(content) {
        return content.map(function(c) {
            switch (c.type) {
                case Token.TEXT:
                    return c.content;
                case Token.BOLD:
                    return "\\textbf{" + c.content + "}";
                case Token.ITALIC:
                    return "\\textit{" + c.content + "}";
                case Token.UNDERLINE:
                    return "\\underline{" + c.content + "}";
                default:
                    throw new Error("Invalid content token: " + c.type);
            }
        }).join("");
    }
}

function HTMLParser() {};

HTMLParser.prototype = {
    parse: function(data) {
        var self = this,
            out = [],
            styles = [],
            depth = -1,
            sectionDepth = 0,
            lastToken;

        var lexer = new Lexer(data);
        data = lexer.lex(data);
        
        data.forEach(function(x) {
            switch (x.type) {
                case Token.SECTION:
                    if (sectionDepth != x.depth) {
                        while (sectionDepth < x.depth) {
                            out.push("<div class='section'>");
                            sectionDepth++;
                        }
                        
                        while (sectionDepth > x.depth) {
                            out.push("</div>");
                            sectionDepth--;
                        }
                    } else if (sectionDepth > 0) {
                        out.push("</div>\n<div class='section'>");
                    }

                    out.push("<h" + sectionDepth + ">" +
                             self._handleContent(x.content) +
                             "</h" + sectionDepth + ">");
                    
                    break;

                case Token.PARA:
                    out.push('<p>' + self._handleContent(x.content) + "</p>");
                    break;

                case Token.BQ_BEGIN:
                    out.push('<blockquote>');
                    break;

                case Token.BQ_END:
                    out.push('</blockquote>');
                    break;

                case Token.UL_BEGIN:
                    out.push('<ul>');
                    depth++;
                    break;
                
                case Token.UL_END:
                    if (lastToken == Token.UL_LI) {
                        out[out.length-1] += "</li>";
                    }
                    
                    if (lastToken == Token.UL_END) {
                        out.push("</li>");
                    }

                    out.push('</ul>');
                    depth--;
                    break;
                
                case Token.OL_BEGIN:
                    out.push('<ol>');
                    depth++;
                    break;
                
                case Token.OL_END:
                    if (lastToken == Token.OL_LI) {
                        out[out.length-1] += "</li>";
                    }
                    
                    if (lastToken == Token.OL_END) {
                        out.push("</li>");
                    }

                    out.push('</ol>');
                    depth--;
                    break;

                case Token.OL_LI:
                case Token.UL_LI:
                    if (lastToken == Token.UL_LI ||
                        lastToken == Token.OL_LI) {
                        out[out.length-1] += "</li>";
                    }
                    
                    out.push("<li>" + self._handleContent(x.content));
                    break;

                case Token.DIRECTIVE:
                    if (x.content.selector.name == "h" && x.content.selector.pseudo.name == "every") {
                        styles.push("h" + 
                                    x.content.selector.pseudo.args[0] + 
                                    ":before { content: '" + 
                                    x.content.rules[0].value +
                                    "'; }");
                    }
                    break;
                        
                default:
                    throw new Error("Invalid token: " + util.inspect(x));
            }

            lastToken = x.type;

            assert(depth >= -1);
            assert(sectionDepth >= 0);
        });
        
        while (sectionDepth > 0) {
            out.push("</div>");
            sectionDepth--;
        }

        return "<style>\n" + styles.join('\n') + "\n</style>\n" +  out.join('\n');
    },

    _handleContent: function(content) {
        var self = this;

        return content.map(function(c) {
            switch (c.type) {
                case Token.LINK:
                    return "<a href='" + c.href + "'" +
                    (c.title ? " title='" + c.title + "'" : "") +
                    ">" + self._handleContent(c.content) + "</a>";
                case Token.TEXT:
                    return c.content;
                case Token.BOLD:
                    return "<strong>" + c.content + "</strong>";
                case Token.ITALIC:
                    return "<em>" + c.content + "</em>";
                case Token.UNDERLINE:
                    return "<u>" + c.content + "</u>";
                default:
                    throw new Error("Invalid content token: " + c.type);
            }
        }).join("");
    }
}

if (process.argv.length < 3) {
    console.log("Usage: legalese.js [--latex] file");
} else {
    var argv = process.argv,
        latex = argv.indexOf("--latex");

    if (latex > -1) {
        argv = argv.splice(latex, 1);
    }
    var data = fs.readFileSync(process.argv[2], {encoding: 'utf-8'}).split('\n');
    
    if (latex > -1) {
        console.log(new LaTeXParser().parse(data));
    } else {
        console.log(new HTMLParser().parse(data));
    }
}

