'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Reminders', 'repeatInterval', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Interval number for custom repeat (e.g., 5 for every 5 minutes)'
    });

    await queryInterface.addColumn('Reminders', 'repeatUnit', {
      type: Sequelize.ENUM('minutes', 'hours', 'days'),
      allowNull: true,
      comment: 'Unit for custom repeat interval'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Reminders', 'repeatInterval');
    await queryInterface.removeColumn('Reminders', 'repeatUnit');
  }
};
