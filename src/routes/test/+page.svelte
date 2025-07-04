<script lang="ts">
	import type { RLEType } from '$lib/types/annotation.type';
	import { rleToMask } from '$lib/utils/rle';
	import { encode } from 'fast-png';

	function decodeRLE(rle: RLEType) {
		const { counts, size } = rle; // counts is the RLE string, size is [height, width]
		const [height, width] = size;
		const flatMask = new Uint8Array(height * width);

		let value = 0;
		let index = 0;

		const runLengths: number[] = [];
		let num = 0;
		let shift = 0;

		for (let i = 0; i < counts.length; i++) {
			const value = counts.charCodeAt(i) - 48; // Base64-like decoding, offset 48
			num |= (value & 0x1f) << shift; // Add the value's 5 least significant bits
			if (value & 0x20) {
				// Continuation bit
				shift += 5;
			} else {
				runLengths.push(num); // End of current run-length
				num = 0;
				shift = 0;
			}
		}

		for (let i = 0; i < runLengths.length; i++) {
			const count = runLengths[i]; // Convert RLE counts from string to integer

			for (let j = 0; j < count; j++) {
				flatMask[index++] = value;
			}
			value = 1 - value; // Toggle value between 0 and 1
		}

		// for (let i = 0, rleLength = counts.length; i < rleLength; i += 2) {
		// 	let zeros = counts.charCodeAt(i);
		// 	let ones = counts.charCodeAt(i + 1) ?? 0;

		// 	index += zeros;

		// 	while (ones > 0) {
		// 		const rowIndex = index % height;
		// 		const colIndex = (index - rowIndex) / height;

		// 		const arrayIndex = rowIndex * width + colIndex;
		// 		flatMask[arrayIndex] = 1;

		// 		index++;
		// 		ones--;
		// 	}
		// }

		// // Reshape flatMask into 2D array
		// const mask = [];
		// for (let i = 0; i < height; i++) {
		// 	mask.push(flatMask.slice(i * width, (i + 1) * width));
		// }

		// return mask;

		return flatMask;
	}

	// Test RLE
	const exampleRLE: RLEType = {
		size: [512, 512],
		counts: 'R[\\39c?6M2O1N101N1O2O0O2O1O000000O1O1O10001N1O1O2N2N2M201LUUV4'
	};

	let png: Uint8Array;

	const test = () => {
		const mask = rleToMask(exampleRLE);

		// png = encode({
		// 	width: 512,
		// 	height: 512,
		// 	data: mask,
		// 	depth: 8,
		// 	channels: 1
		// });

		// make the picture black and white in RGB
		const data = new Uint8Array(512 * 512 * 4);
		for (let i = 0; i < 512 * 512; i++) {
			const value = mask[i] * 255;
			data[i * 4] = value;
			data[i * 4 + 1] = value;
			data[i * 4 + 2] = value;
			data[i * 4 + 3] = 255;
		}

		png = encode({
			width: 512,
			height: 512,
			data,
			depth: 8,
			channels: 4
		});
	};

	test();
</script>

<img src={URL.createObjectURL(new Blob([png]))} alt="" />

<style>
	img {
		display: block;
		float: left;
		border: 1px solid red;
		image-rendering: pixelated;
	}
</style>
