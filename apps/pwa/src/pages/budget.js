import '@picocss/pico/css/pico.min.css';
import { mount } from 'svelte';
import Navbar from '../lib/components/Navbar.svelte';
import Budget from '../lib/components/Budget.svelte';
import UpdatePrompt from '../lib/components/UpdatePrompt.svelte';

mount(Navbar, { target: document.body });
mount(Budget, { target: document.body });
mount(UpdatePrompt, { target: document.body });
