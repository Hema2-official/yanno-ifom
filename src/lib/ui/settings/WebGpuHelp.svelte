<script lang="ts">
	import { chromiumVersion, isApple, isLinux, isWindows } from '$lib/utils/platform';
</script>

{#snippet command(text: string)}
	<code
		class="bg-muted text-foreground block rounded px-2 py-1 font-mono wrap-anywhere select-all"
	>
		{text}
	</code>
{/snippet}

<div class="text-muted-foreground flex flex-col gap-2 py-2 text-xs">
	{#if !isSecureContext}
		<p>Browsers only offer WebGPU on HTTPS sites and on localhost.</p>
	{:else if isLinux}
		{#if !chromiumVersion}
			<p>Some browsers may lack WebGPU support on Linux. Try a Chromium-based one.</p>
		{/if}
		<p>Install Vulkan drivers for your GPU brand.</p>
		<p>Debian, Ubuntu:</p>
		{@render command('sudo apt install mesa-vulkan-drivers vulkan-tools')}
		<p>Fedora:</p>
		{@render command('sudo dnf install mesa-vulkan-drivers vulkan-tools')}
		<p>Arch:</p>
		{@render command('sudo pacman -S vulkan-intel vulkan-radeon vulkan-tools')}
		<p>You should then see your GPU when running:</p>
		{@render command('vulkaninfo --summary')}
		<p>
			Chrome only turns WebGPU on by itself for recent Intel GPUs and for NVIDIA on Wayland.
			On other GPUs, start it with:
		</p>
		{@render command(
			'google-chrome --enable-unsafe-webgpu --ozone-platform=x11 --use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE'
		)}
	{:else if isWindows}
		<p>
			Update your graphics driver from Windows Update or your GPU maker's site. WebGPU uses
			Direct3D 12 on Windows. If you're using a remote desktop or a virtual machine, this will
			probably not work.
		</p>
	{:else if isApple}
		<p>
			Update macOS and your browser. WebGPU needs at least Chrome 113, or Safari on macOS 26.
		</p>
	{:else}
		<p>Update your graphics driver and your browser.</p>
	{/if}
	{#if isSecureContext}
		<p>Graphics acceleration must also be switched on in your browser's settings.</p>
		{#if chromiumVersion}
			<p>
				The WebGPU section of <code class="text-foreground">chrome://gpu</code> shows what your
				browser found.
			</p>
		{/if}
	{/if}
</div>
