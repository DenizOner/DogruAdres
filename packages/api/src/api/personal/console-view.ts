/**
 * Personal Workspace SPA Console View.
 * Renders the HTML document containing the client UI and controller scripts.
 * Assembled from modular domain components in ./console/
 */
import { consoleStyles } from "./console/styles"
import { consoleHtml } from "./console/html"
import { consoleEarlyTokenScript, consoleScripts } from "./console/scripts"

export function renderPersonalConsole(nonce: string): string {
  return [
    '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DoğruAdres kişisel çalışma alanı</title>\n  <script nonce="',
    nonce,
    '">\n',
    consoleEarlyTokenScript,
    '\n  </script>\n  <style nonce="',
    nonce,
    '">\n',
    consoleStyles,
    '\n  </style>\n',
    consoleHtml,
    '\n  <script nonce="',
    nonce,
    '">\n',
    consoleScripts,
    '\n  </script></html>'
  ].join("")
}
