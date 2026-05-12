
async function testHealth() {
  try {
    const response = await fetch('http://localhost:3000/api/health');
    const data = await response.json();
    console.log('Backend Health:', data);
  } catch (error) {
    console.error('Backend Health Check Failed:', error.message);
  }
}

testHealth();
