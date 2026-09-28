async function test() {
  const url = 'https://vid.puffyan.us/api/v1/search?q=traumprinz';
  const res = await fetch(url);
  const data = await res.json();
  console.log(data.length);
}
test();
