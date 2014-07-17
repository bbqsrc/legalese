"use strict";

var Lexer = require('./lexer').Lexer,
    Token = require('./lexer').Token,
    assert = require('assert');

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
                case Token.SECTION:
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

                case Token.PARA:
                    out.push('<p>' + x.content + "</p>");
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
    "## Second level title, woot\n" +
    "\n" +
    "* List ?\n" +
    "\n" +
    "1. Ordered list!\n2. Another item!\n" +
    "  1. Another one.\n" +
    "  2. Another another.\n" +
    "    * Depth of steel?\n" +
    "\n" +
    "> Quote!\n" +
    ">> Have some depth!\n" +
    ">> \n" +
    ">> * Have some depth!\n" +
    ">> * Have some depth!\n" +
    ">> * Have some depth!\n";

test2();
