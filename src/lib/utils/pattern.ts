class PatternClass {
	private pattern: string;
	private regex: RegExp;
	private count: number;
	private strict: boolean;

	private noMatchError = (str: string) =>
		new Error(`String "${str}" does not match pattern "${this.pattern}"`);

	constructor(pattern: string, strict = true) {
		this.pattern = pattern;
		this.strict = strict;

		this.count = (pattern.match(/#/g) || []).length;
		if (this.count === 0) throw new Error('Pattern must contain at least one #');

		// Replace # with (\d+)
		this.regex = new RegExp(pattern.replace(/#/g, '(-?\\d+)'));
	}

	match(str: string): number[] {
		const regexMatches = str.match(this.regex);
		if (regexMatches === null) throw this.noMatchError(str);

		if (this.strict && regexMatches.length - 1 !== this.count) throw this.noMatchError(str);

		const matches = regexMatches.slice(1).map(Number);
		if (matches.some(isNaN)) throw this.noMatchError(str);

		return matches;
	}
}

function P(pattern: string, strict = true): PatternClass {
	return new PatternClass(pattern, strict);
}

export { P };
