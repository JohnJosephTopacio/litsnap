# E2E fixtures

- `jekyll-and-hyde.epub`: _The Strange Case of Dr. Jekyll and Mr. Hyde_ by Robert Louis Stevenson, from [Standard Ebooks](https://standardebooks.org/ebooks/robert-louis-stevenson/the-strange-case-of-dr-jekyll-and-mr-hyde). It's dedicated to the public domain under CC0 1.0 (see the book's own Uncopyright page), so it can be committed. It's used unmodified as "a real, well-made EPUB": cover, a 14-entry TOC, and an external link in the colophon. Note that Standard Ebooks puts a no-break space after "Mr.", so tests match text like "Utterson the lawyer" rather than "Mr. Utterson".

Every other test book is built in memory by [`../fixtures.ts`](../fixtures.ts), from the same builder the unit tests use (`src/epub/testing/buildEpub.ts`). That way each test shows exactly what its book contains, and there are no binary files to review:

| Fixture                                                                 | For                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `scriptedEpub`, `remoteImageEpub`, `hostileTitleEpub`, `hostileTocEpub` | Security: RD-21, RD-22, RD-24                                                                                |
| `fakeDrmEpub`, `corruptEpub`, `pdfFile`, `textFile`, `secondEpub`       | Opening: RD-2…7                                                                                              |
| `colouredEpub`, `footnoteEpub`, `linksEpub`                             | Themes, footnotes, links: RD-17, RD-19, RD-20                                                                |
| `fixedLayoutEpub`                                                       | Fixed-layout books: RD-27, RD-28                                                                             |
| `positionedBodyEpub`                                                    | Pages that absolutely position `<body>`: RD-29                                                               |
| `lookupEpub`                                                            | Selection menu and lookup modal: short and 10-word sentences, and markup that is only text (MENU-_, MODAL-_) |

To select text in a book like a reader would (a real mouse drag, or a script selection with no pointer), use the helpers in [`../selection.ts`](../selection.ts): `dragSelect`, `scriptSelect`, `textBoxes`.

**Never commit a book you don't have the right to redistribute.** To reproduce a problem found in a real book, copy just the structure that triggers it (markup and CSS) into a generated fixture, as `positionedBodyEpub` does.
