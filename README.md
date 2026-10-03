# emojiii

Letters that turn into emojis. Type, hover, delete, and emojis grow out of your words.

## Use it

```bash
npm i emojiii gsap
```

```js
import { hover, garden } from 'emojiii'

const stop = hover(document.querySelector('h1'))   // letters swap to emojis under the pointer
// garden(document.querySelector('h1'))            // emojis sprout on top of the letters
// stop()                                          // puts the original text back
```

Both read the element's text for context ("pizza" grows 🍕, "rain" grows ☔) and accept
`{ emojis: [...] }` to use your own pool. `gsap` is a peer dependency.

## How the context works

No AI. About 3,600 keywords from emojilib and the Unicode names, light stemming
(raining, rained, rains), half-typed words from 4 letters, the emojis next to a match in
Unicode order (related ones sit together), and a few hand-made themes. Words with no match
borrow the nearest earlier match in their sentence.

## Emojis and licensing

emojiii ships no emoji images. Emojis are drawn with the visitor's own emoji font: Apple Color
Emoji on Apple devices, Noto Color Emoji (SIL Open Font License) everywhere else.

## Credits

- Inspired by the hero animation on [wabi.ai](https://wabi.ai)
- [emojilib](https://github.com/muan/emojilib) (MIT) and [unicode-emoji-json](https://github.com/muan/unicode-emoji-json) (MIT) for emoji keywords
- [GSAP](https://gsap.com) for animation, under its own [standard license](https://gsap.com/standard-license)
- Fonts on the site: Plus Jakarta Sans and Fraunces (SIL Open Font License)
- GIF export: [gifenc](https://github.com/mattdesl/gifenc) (MIT)

## Develop

```bash
npm i
npm run dev        # the playground
npm run build      # the site
npm run build:lib  # the library
npm run index      # rebuild src/emoji-index.json
```

MIT licensed.
