/* learn.js — fetches short definitions for clicked terms.
   Kept behavior but improved UI handling and errors.
*/

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('definition-modal');
  const modalTerm = document.getElementById('modal-term');
  const modalDefinition = document.getElementById('modal-definition');
  const closeModalBtn = document.querySelector('.modal-close-btn');
  const terms = document.querySelectorAll('.quantum-term');

  const openModal = (term) => {
    modalTerm.textContent = term.charAt(0).toUpperCase() + term.slice(1);
    modalDefinition.textContent = 'Fetching definition...';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    modalTerm.textContent = '';
    modalDefinition.textContent = '';
  };

  const fetchDefinition = async (term) => {
    openModal(term);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${term}`);
      if (!res.ok) throw new Error('No definition found.');
      const data = await res.json();
      const def = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      if (!def) throw new Error('Definition not found in API response.');
      modalDefinition.textContent = def;
    } catch (err) {
      // Fallback friendly explanation for quantum-ish terms
      const fallback = {
        superposition: 'Quantum superposition: a system existing in multiple states simultaneously until measured.',
        quantum: 'Quantum: pertaining to discrete levels and phenomena in quantum mechanics.',
        algorithm: 'Algorithm: a stepwise procedure for calculations and problem solving.'
      };
      modalDefinition.textContent = fallback[term] || err.message || 'Definition unavailable.';
    }
  };

  terms.forEach(el => {
    el.addEventListener('click', () => {
      const term = el.dataset.term || el.textContent.trim().toLowerCase();
      fetchDefinition(term);
    });
  });

  closeModalBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) closeModal();
  });
});
