# IFOM annotation frontend

This project aims to provide an easy-to-use frontend for annotating tracking and segmentating algorithms.

## Prerequisites

- Install Node.js
- Install pnpm
    ```bash
    npm install -g pnpm@latest
    ```

## How to run

1. Run `pnpm install` to install the necessary dependencies
2. Run `pnpm run dev` to run the project

## License

Copyright (C) 2023–2026 Mátyás Nyilas

This program and its documentation are free software: you can redistribute them and/or modify them under the terms of the GNU General Public License version 3 as published by the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU General Public License](LICENSE) for more details.

The components in `src/lib/components/ui/` and the agent skill in `.agents/skills/shadcn-svelte/` and `.claude/skills/shadcn-svelte/` come from [shadcn-svelte](https://github.com/huntabyte/shadcn-svelte) and are under its [MIT license](src/lib/components/ui/LICENSE).
