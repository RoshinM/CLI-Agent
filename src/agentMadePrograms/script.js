const pokemonNameInput = document.getElementById('pokemon-name');
const fetchPokemonButton = document.getElementById('fetch-pokemon');
const pokemonDetailsDiv = document.getElementById('pokemon-details');

fetchPokemonButton.addEventListener('click', async () => {
  const pokemonName = pokemonNameInput.value.toLowerCase();
  const url = `https://pokeapi.co/api/v2/pokemon/${pokemonName}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    const pokemonImage = data.sprites.front_default;
    const pokemonName = data.name;
    const pokemonStats = data.stats;
    const pokemonTypes = data.types;
    const pokemonWeight = data.weight;
    const pokemonHeight = data.height;
    const pokemonAbilities = data.abilities;

    const pokemonHtml = `
      <h2>${pokemonName}</h2>
      <img src=${pokemonImage} alt=${pokemonName}>
      <h3>Stats:</h3>
      <ul>
        ${pokemonStats.map(stat => `<li>${stat.stat.name}: ${stat.base_stat}</li>`).join('')}
      </ul>
      <h3>Types:</h3>
      <ul>
        ${pokemonTypes.map(type => `<li>${type.type.name}</li>`).join('')}
      </ul>
      <h3>Weight: ${pokemonWeight}</h3>
      <h3>Height: ${pokemonHeight}</h3>
      <h3>Abilities:</h3>
      <ul>
        ${pokemonAbilities.map(ability => `<li>${ability.ability.name}</li>`).join('')}
      </ul>
    `;
    pokemonDetailsDiv.innerHTML = pokemonHtml;
  } catch (error) {
    console.error(error);
    pokemonDetailsDiv.innerHTML = 'Pokemon not found';
  }
});