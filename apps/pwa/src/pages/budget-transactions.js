import '@picocss/pico/css/pico.min.css';
import { mount } from 'svelte';
import Navbar from '../lib/components/Navbar.svelte';
import BudgetTransactions from '../lib/components/BudgetTransactions.svelte';
import UpdatePrompt from '../lib/components/UpdatePrompt.svelte';

mount(Navbar, { target: document.body });
mount(BudgetTransactions, { target: document.body });
mount(UpdatePrompt, { target: document.body });
