import '@picocss/pico/css/pico.min.css';
import { mount } from 'svelte';
import Navbar from '../lib/components/Navbar.svelte';
import Blotter from '../lib/components/Blotter.svelte';
import UpdatePrompt from '../lib/components/UpdatePrompt.svelte';

mount(Navbar, { target: document.body });
mount(Blotter, { target: document.body });
mount(UpdatePrompt, { target: document.body });
