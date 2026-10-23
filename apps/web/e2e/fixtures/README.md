# E2E fixtures

- `jekyll-and-hyde.epub`: _The Strange Case of Dr. Jekyll and Mr. Hyde_ by Robert Louis Stevenson, from [Standard Ebooks](https://standardebooks.org/ebooks/robert-louis-stevenson/the-strange-case-of-dr-jekyll-and-mr-hyde). It's dedicated to the public domain under CC0 1.0 (see the book's own Uncopyright page), so it can be committed. It's used unmodified as "a real, well-made EPUB": cover, TOC, and an external link in the colophon.

All other test books (DRM markers, scripts, remote images, hostile metadata) are built in memory by [`../fixtures.ts`](../fixtures.ts) from the same builder the unit tests use. That way each test shows exactly what its book contains, and there are no binary files to review.
